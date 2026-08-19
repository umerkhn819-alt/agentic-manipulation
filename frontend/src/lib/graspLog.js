/**
 * Log grasp poses to the browser console in a shape a robot controller could consume.
 *
 * Deliberately explicit about units and frames of reference, because a grasp pose that does
 * not say what its numbers mean is dangerous to act on:
 *   - normalized coordinates (0-1 of the image) AND pixel coordinates
 *   - angle in degrees, 0-180, describing the direction the JAWS CLOSE
 *   - depth_m: null, because no depth model is available on Hugging Face — an honest null
 *     rather than a plausible-looking number a controller might trust
 */
export function logGrasps(result) {
  if (!result?.ok) return

  const grasps = (result.detections || []).filter((d) => d.grasp)
  if (!grasps.length) return

  const frameWidth = result.processed_width || 0
  const frameHeight = result.processed_height || 0
  const timestamp = Date.now()

  const poses = grasps.map((detection) => {
    const grasp = detection.grasp
    return {
      label: detection.label,
      // Normalized image coordinates, resolution independent.
      x: Number(grasp.x.toFixed(4)),
      y: Number(grasp.y.toFixed(4)),
      // Same point in pixels of the frame that was analysed.
      x_px: Math.round(grasp.x * frameWidth),
      y_px: Math.round(grasp.y * frameHeight),
      // Direction the jaws close, degrees, 0-180 (a gripper is symmetric).
      angle_deg: grasp.angle_deg,
      // How far apart the fingers must open.
      width_norm: grasp.width_norm,
      width_px: Math.round(grasp.width_norm * frameWidth),
      // Where the fingers would actually touch the object.
      jaws: grasp.jaws.map((jaw) => ({
        x: Number(jaw.x.toFixed(4)),
        y: Number(jaw.y.toFixed(4)),
      })),
      // NOT AVAILABLE. No depth model is served by any Hugging Face provider, so this is
      // explicitly null rather than a guess. A controller must supply its own depth.
      depth_m: null,
      confidence: detection.score,
      frame: 'image_normalized',
      frame_size: [frameWidth, frameHeight],
      source: result.source,
      ts: timestamp,
    }
  })

  console.groupCollapsed(
    `%c[grasp] ${poses.length} pose(s) @ ${new Date(timestamp).toLocaleTimeString()}`,
    'color:#ff3b6b;font-weight:600',
  )
  // console.table gives a readable grid; the raw array below stays copy-pasteable.
  console.table(
    poses.map((p) => ({
      label: p.label,
      x: p.x,
      y: p.y,
      x_px: p.x_px,
      y_px: p.y_px,
      angle_deg: p.angle_deg,
      width_px: p.width_px,
      depth_m: p.depth_m,
    })),
  )
  console.log('robot-controller payload:', poses)
  console.groupEnd()

  return poses
}
