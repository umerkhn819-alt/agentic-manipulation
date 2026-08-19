/**
 * All canvas drawing lives here.
 *
 * THE ONE COORDINATE RULE
 * -----------------------
 * Every coordinate from the backend is normalized 0.0-1.0. The canvas is sized to the
 * video's NATIVE pixel dimensions (canvas.width === video.videoWidth). So drawing is
 * always just:
 *
 *     x_pixels = box.x1 * canvas.width
 *
 * The backend already absorbed the messy part — that it compressed the frame to 640px, and
 * that different models report coordinates differently. None of that leaks in here.
 */

// Distinct, high-contrast colours assigned per label so the same object type keeps its
// colour between frames (less visual flicker while streaming).
const PALETTE = [
  '#22d3ee', // cyan
  '#a3e635', // lime
  '#fbbf24', // amber
  '#f472b6', // pink
  '#818cf8', // indigo
  '#fb923c', // orange
  '#4ade80', // green
  '#e879f9', // fuchsia
]

const labelColors = new Map()

/** Stable colour per label: same word always gets the same colour. */
export function colorForLabel(label) {
  if (!labelColors.has(label)) {
    // Hash the label so colour assignment doesn't depend on detection order.
    let hash = 0
    for (let i = 0; i < label.length; i++) {
      hash = (hash * 31 + label.charCodeAt(i)) >>> 0
    }
    labelColors.set(label, PALETTE[hash % PALETTE.length])
  }
  return labelColors.get(label)
}

/** Wipe the overlay. Called before every redraw and when results are cleared. */
export function clearCanvas(canvas) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

/**
 * Draw detection boxes and labels.
 *
 * Line widths and font sizes are scaled to the canvas size so the overlay looks the same
 * on a 640px webcam and a 1920px one.
 */
export function drawDetections(canvas, detections) {
  if (!canvas || !detections?.length) return

  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  // Scale strokes/text relative to frame size (640px base).
  const scale = Math.max(width / 800, 0.75)
  const lineWidth = Math.round(3 * scale)
  const fontSize = Math.round(15 * scale)
  const paddingH = Math.round(8 * scale)
  const paddingV = Math.round(4 * scale)

  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'top'

  for (const detection of detections) {
    const { box, label, score } = detection
    const color = colorForLabel(label)

    // Convert normalized (0..1) coordinates to canvas pixels
    const x = Math.round(box.x1 * width)
    const y = Math.round(box.y1 * height)
    const boxWidth = Math.round((box.x2 - box.x1) * width)
    const boxHeight = Math.round((box.y2 - box.y1) * height)

    // Crisp bounding box outline
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = color
    ctx.strokeRect(x, y, boxWidth, boxHeight)

    // Label text format: "label: XX%" exactly matching standard CV benchmarks
    const text = score == null ? `${label}` : `${label}: ${(score * 100).toFixed(0)}%`

    const textWidth = ctx.measureText(text).width
    const badgeHeight = fontSize + paddingV * 2
    const badgeWidth = textWidth + paddingH * 2

    // Position badge directly on top of the box
    const badgeY = y - badgeHeight >= 0 ? y - badgeHeight : y

    // Badge background
    ctx.fillStyle = color
    ctx.fillRect(x, badgeY, badgeWidth, badgeHeight)

    // High contrast badge text
    ctx.fillStyle = '#000000'
    ctx.fillText(text, x + paddingH, badgeY + paddingV)
  }
}


/* -------------------------------------------------------------------------------------
   Segmentation masks
   ------------------------------------------------------------------------------------- */

// Decoded masks are cached by their data URL. Without this, streaming would re-decode the
// same PNGs every frame.
const maskCache = new Map()
const MASK_CACHE_LIMIT = 60

async function decodeMask(dataUrl) {
  if (maskCache.has(dataUrl)) return maskCache.get(dataUrl)

  // The backend sends RGBA PNGs whose ALPHA channel carries the silhouette: opaque on the
  // object, fully transparent elsewhere. That is what lets 'source-in' tint the shape
  // rather than the whole rectangle.
  const blob = await (await fetch(dataUrl)).blob()
  const bitmap = await createImageBitmap(blob)

  // Simple FIFO eviction — masks change every frame while streaming.
  if (maskCache.size >= MASK_CACHE_LIMIT) {
    const oldest = maskCache.keys().next().value
    maskCache.get(oldest)?.close?.()
    maskCache.delete(oldest)
  }
  maskCache.set(dataUrl, bitmap)
  return bitmap
}

/**
 * Paint each mask as a translucent coloured silhouette.
 *
 * Tinting works in two steps on an offscreen canvas:
 *   1. draw the mask (transparent background, opaque object)
 *   2. fill with the label colour using 'source-in', which paints ONLY where the mask is
 *      already opaque — i.e. exactly the object's shape
 * The tinted result is then composited at globalAlpha 0.4 so the video stays visible.
 */
function drawMasks(canvas, detections, bitmaps) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  const scratch = document.createElement('canvas')
  scratch.width = width
  scratch.height = height
  const scratchCtx = scratch.getContext('2d')

  ctx.save()
  ctx.globalAlpha = 0.4

  detections.forEach((detection, index) => {
    const bitmap = bitmaps[index]
    if (!bitmap) return

    scratchCtx.clearRect(0, 0, width, height)
    // Masks are generated at the compressed size, so scale to the canvas.
    scratchCtx.drawImage(bitmap, 0, 0, width, height)

    scratchCtx.globalCompositeOperation = 'source-in'
    scratchCtx.fillStyle = colorForLabel(detection.label)
    scratchCtx.fillRect(0, 0, width, height)
    scratchCtx.globalCompositeOperation = 'source-over'

    ctx.drawImage(scratch, 0, 0)
  })

  ctx.restore()
}

/* -------------------------------------------------------------------------------------
   Grasp markers
   ------------------------------------------------------------------------------------- */

/**
 * Draw where a two-fingered gripper would close on each object.
 *
 * Three parts, all from real mask geometry:
 *   - a crosshair at the grasp point (the mask's centre of mass)
 *   - a line along the CLOSING axis, i.e. the direction the jaws travel
 *   - a bracket at each end marking where the jaws would actually touch the object
 */

/* -------------------------------------------------------------------------------------
   FoundationPose 3D Coordinate Frame Triad & Trajectory Tracking
   ------------------------------------------------------------------------------------- */

/**
 * Renders 3D Coordinate Frame Triad (RGB: Red = X, Green = Y, Blue = Z) anchored to the object's 3D centroid.
 */
function draw3DCoordinateAxes(canvas, detections) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  ctx.save()
  ctx.lineCap = 'round'

  for (const det of detections) {
    const axes = det.pose_6d?.axes_3d
    if (!axes) continue

    const ox = axes.origin.x * width
    const oy = axes.origin.y * height
    const xx = axes.x_axis.x * width
    const xy = axes.x_axis.y * height
    const yx = axes.y_axis.x * width
    const yy = axes.y_axis.y * height
    const zx = axes.z_axis.x * width
    const zy = axes.z_axis.y * height

    // X-Axis (Red: Right)
    ctx.lineWidth = 3.5
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(xx, xy)
    ctx.stroke()

    // Y-Axis (Green: Up)
    ctx.strokeStyle = '#22c55e'
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(yx, yy)
    ctx.stroke()

    // Z-Axis (Blue: Out / Optical Depth)
    ctx.strokeStyle = '#3b82f6'
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(zx, zy)
    ctx.stroke()

    // Centroid Pivot Sphere
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Renders glowing 3D trajectory tracking trails across consecutive video frames.
 */
function draw3DTrajectoryTrails(canvas, detections) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  ctx.save()

  for (const det of detections) {
    const history = det.pose_6d?.trajectory_history
    if (!history || history.length < 2) continue

    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#00f2fe'
    ctx.shadowColor = '#00f2fe'
    ctx.shadowBlur = 8

    ctx.beginPath()
    history.forEach((pt, i) => {
      const px = pt.x * width
      const py = pt.y * height
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()

    // Velocity tag at leading point
    const latest = history[history.length - 1]
    const vel = det.pose_6d?.velocity_3d || [0, 0, 0]
    const speed = Math.hypot(vel[0], vel[1], vel[2]).toFixed(2)

    if (det.pose_6d?.tracking_id) {
      ctx.fillStyle = '#00f2fe'
      ctx.font = 'bold 10px monospace'
      ctx.fillText(
        `[${det.pose_6d.tracking_id}] ${speed} m/s`,
        latest.x * width + 8,
        latest.y * height - 8
      )
    }
  }

  ctx.restore()
}

/**
 * Draw 3D wireframe bounding cuboids and pose readouts.
 */
function draw3DPoseBoxes(canvas, detections) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  ctx.save()
  const scale = Math.max(width / 1280, 0.6)
  const lineWidth = Math.max(2, Math.round(2 * scale))
  const fontSize = Math.round(11 * scale)

  ctx.font = `bold ${fontSize}px monospace`

  for (const det of detections) {
    const pose = det.pose_6d
    if (!pose || !pose.bbox_3d?.length) continue

    const pts = pose.bbox_3d.map((p) => ({
      x: Math.round(p.x * width),
      y: Math.round(p.y * height),
    }))

    if (pts.length < 8) continue

    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = lineWidth

    // Front Face (0-1-2-3-0)
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[1].x, pts[1].y)
    ctx.lineTo(pts[2].x, pts[2].y)
    ctx.lineTo(pts[3].x, pts[3].y)
    ctx.closePath()
    ctx.stroke()

    // Back Face (4-5-6-7-4)
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(pts[4].x, pts[4].y)
    ctx.lineTo(pts[5].x, pts[5].y)
    ctx.lineTo(pts[6].x, pts[6].y)
    ctx.lineTo(pts[7].x, pts[7].y)
    ctx.closePath()
    ctx.stroke()

    // Connecting Depth Edges
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(pts[i].x, pts[i].y)
      ctx.lineTo(pts[i + 4].x, pts[i + 4].y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  ctx.restore()
}

function drawGrasps(canvas, detections) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas

  const scale = Math.max(width / 1280, 0.6)
  const lineWidth = Math.max(2, Math.round(2.5 * scale))
  const radius = Math.round(13 * scale)
  const jawSize = Math.round(11 * scale)
  const fontSize = Math.round(14 * scale)

  ctx.save()
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textBaseline = 'top'

  for (const detection of detections) {
    const grasp = detection.grasp
    if (!grasp) continue

    const x = grasp.x * width
    const y = grasp.y * height

    // Jaw contact points, drawn from the real coordinates the backend computed.
    const jaws = (grasp.jaws || []).map((jaw) => ({ x: jaw.x * width, y: jaw.y * height }))

    // 1. Closing axis between the two jaws.
    if (jaws.length === 2) {
      ctx.lineWidth = lineWidth + 2
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.moveTo(jaws[0].x, jaws[0].y)
      ctx.lineTo(jaws[1].x, jaws[1].y)
      ctx.stroke()

      ctx.lineWidth = lineWidth
      ctx.strokeStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(jaws[0].x, jaws[0].y)
      ctx.lineTo(jaws[1].x, jaws[1].y)
      ctx.stroke()

      // 2. Jaw plates: short bars perpendicular to the closing direction, so they read as
      //    gripper fingers rather than as line ends.
      const angle = (grasp.angle_deg * Math.PI) / 180
      const px = Math.cos(angle + Math.PI / 2) * jawSize
      const py = Math.sin(angle + Math.PI / 2) * jawSize

      for (const jaw of jaws) {
        ctx.lineWidth = lineWidth + 3
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.beginPath()
        ctx.moveTo(jaw.x - px, jaw.y - py)
        ctx.lineTo(jaw.x + px, jaw.y + py)
        ctx.stroke()

        ctx.lineWidth = lineWidth + 1
        ctx.strokeStyle = '#ffffff'
        ctx.beginPath()
        ctx.moveTo(jaw.x - px, jaw.y - py)
        ctx.lineTo(jaw.x + px, jaw.y + py)
        ctx.stroke()
      }
    }

    // 3. Crosshair at the grasp point.
    ctx.lineWidth = lineWidth + 2
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    crosshair(ctx, x, y, radius)
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = '#ff3b6b'
    crosshair(ctx, x, y, radius)

    // Label: the numbers a controller would consume.
    const text = `${(grasp.width_norm * width).toFixed(0)}px · ${grasp.angle_deg.toFixed(0)}°`
    const textWidth = ctx.measureText(text).width
    const pad = Math.round(5 * scale)

    ctx.fillStyle = 'rgba(11, 16, 32, 0.82)'
    ctx.fillRect(x + radius + pad, y - fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2)
    ctx.fillStyle = '#ff8fa8'
    ctx.fillText(text, x + radius + pad * 2, y - fontSize / 2)
  }

  ctx.restore()
}

function crosshair(ctx, x, y, radius) {
  const gap = radius * 0.38
  ctx.beginPath()
  ctx.moveTo(x - radius, y)
  ctx.lineTo(x - gap, y)
  ctx.moveTo(x + gap, y)
  ctx.lineTo(x + radius, y)
  ctx.moveTo(x, y - radius)
  ctx.lineTo(x, y - gap)
  ctx.moveTo(x, y + gap)
  ctx.lineTo(x, y + radius)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * Redraw the whole overlay from a result object.
 *
 * Async because masks must be decoded before they can be painted. Layers are drawn
 * back-to-front: masks, then boxes, then grasp markers.
 *
 * Pass a `token` and `isCurrent` callback so a slow mask decode from an older frame cannot
 * paint over a newer result — important once streaming is running.
 */
export async function renderResult(
  canvas,
  result,
  isCurrent = () => true,
  layers = { boxes: true, masks: true, grasps: true, poses: true }
) {
  if (!canvas) return

  if (!result?.ok) {
    clearCanvas(canvas)
    return
  }

  const detections = result.detections || []

  // Decode masks if layer is active
  let bitmaps = []
  if (layers.masks && detections.some((d) => d.mask)) {
    bitmaps = await Promise.all(
      detections.map((d) => (d.mask ? decodeMask(d.mask).catch(() => null) : null)),
    )
    if (!isCurrent()) return
  }

  clearCanvas(canvas)
  if (layers.masks && bitmaps.length) drawMasks(canvas, detections, bitmaps)
  if (layers.boxes) drawDetections(canvas, detections)
  if (layers.poses) {
    draw3DTrajectoryTrails(canvas, detections)
    draw3DPoseBoxes(canvas, detections)
    draw3DCoordinateAxes(canvas, detections)
  }
  if (layers.grasps && detections.some((d) => d.grasp)) drawGrasps(canvas, detections)
}


