/**
 * Talking to the backend, and turning a video frame into something sendable.
 */

/**
 * Grab the current video frame as a base64 JPEG data URL.
 *
 * Draws at the video's NATIVE resolution (videoWidth/videoHeight), not its displayed CSS
 * size, so what we analyse is the full-quality frame regardless of window size. The backend
 * compresses it to 640px anyway, but starting from the native frame keeps quality up.
 */
export function captureFrame(video, quality = 0.9) {
  if (!video || !video.videoWidth || !video.videoHeight) {
    throw new Error('Camera is not ready yet — no video frame available.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * POST one frame to the backend for detection.
 *
 * The backend always replies HTTP 200 with an `ok` flag, so the real error text is always
 * reachable in the same place rather than hidden in an HTTP status.
 */
export async function detectFrame({ image, prompt, zeroShot = false, segment = false, grasp = false, weights = null, signal }) {
  let response
  try {
    response = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        prompt,
        zero_shot: zeroShot,
        segment,
        grasp,
        weights,
      }),
      signal,
    })

  } catch (err) {
    // Network-level failure: backend down, proxy misconfigured, request aborted.
    if (err.name === 'AbortError') throw err
    return {
      ok: false,
      detections: [],
      error: {
        stage: 'network',
        message:
          `Could not reach the backend: ${err.message}\n\n` +
          `Is it running? In a separate terminal:\n` +
          `    cd backend\n` +
          `    python run.py`,
      },
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      detections: [],
      error: {
        stage: 'network',
        status: response.status,
        message: `Backend returned HTTP ${response.status}. ${text}`.trim(),
      },
    }
  }

  try {
    return await response.json()
  } catch (err) {
    return {
      ok: false,
      detections: [],
      error: { stage: 'network', message: `Backend sent a non-JSON response: ${err.message}` },
    }
  }
}

/**
 * Read backend health — used to warn about a missing token before you bother capturing.
 * Returns null if the backend is unreachable, which the UI reports as "backend offline".
 */
export async function fetchHealth() {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchPresets() {
  try {
    const response = await fetch('/api/presets')
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

/**
 * Step PyBullet 3D physics engine and fetch synthetic camera frame & telemetry.
 */
export async function stepPyBulletSim(params = {}) {
  try {
    const response = await fetch('/api/sim/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Reset PyBullet simulation world.
 */
export async function resetPyBulletSim() {
  try {
    const response = await fetch('/api/sim/reset')
    return await response.json()
  } catch {
    return { ok: false }
  }
}

/**
 * Run automated batch evaluation across dataset scenes.
 */
export async function runBatchBenchmarks() {
  try {
    const response = await fetch('/api/benchmarks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Launch Franka Emika Panda PyBullet native 3D desktop window on laptop.
 */
export async function launchSimGui() {
  try {
    const response = await fetch('/api/sim/launch-gui', { method: 'POST' })
    return await response.json()
  } catch {
    return { ok: false, message: 'Could not communicate with backend' }
  }
}

/**
 * Send grasp execution target (X, Y, Z, Yaw) to native 3D PyBullet simulator.
 */
export async function executeSimGrasp(target = {}) {
  try {
    const response = await fetch('/api/sim/execute-grasp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    })
    return await response.json()
  } catch {
    return { ok: false }
  }
}

/**
 * Check if native 3D PyBullet desktop window is currently open and connected.
 */
export async function fetchGuiStatus() {
  try {
    const response = await fetch('/api/sim/gui-status')
    if (!response.ok) return { connected: false }
    return await response.json()
  } catch {
    return { connected: false }
  }
}



