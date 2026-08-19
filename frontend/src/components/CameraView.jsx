import { useEffect } from 'react'

/**
 * The live video with a canvas overlay locked exactly on top of it.
 *
 * Alignment rule: the container's aspect-ratio dynamically matches the video stream's
 * native resolution (dimensions.width / dimensions.height), and canvas.width/height is
 * set to the video resolution. That way the canvas matches the video pixels 1:1 with ZERO offset.
 */
export function CameraView({ videoRef, canvasRef, dimensions, status, mirrored, children }) {
  // Resize the canvas backing store whenever the video's native resolution changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dimensions.width || !dimensions.height) return

    if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
      canvas.width = dimensions.width
      canvas.height = dimensions.height
    }
  }, [dimensions, canvasRef])

  const aspect =
    dimensions.width && dimensions.height
      ? `${dimensions.width} / ${dimensions.height}`
      : '4 / 3'

  return (
    <div
      className={`camera-view ${mirrored ? 'mirrored' : ''}`}
      style={{ aspectRatio: aspect }}
    >
      {/* playsInline stops iOS from hijacking playback into fullscreen. */}
      <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

      {/* The overlay. pointer-events:none in CSS so it never blocks clicks. */}
      <canvas ref={canvasRef} className="camera-canvas" />

      {status !== 'live' && (
        <div className="camera-placeholder">
          {status === 'starting' ? 'Starting camera…' : 'Camera is off'}
        </div>
      )}

      {/* Overlays that must NOT be mirrored (spinners, badges) are passed as children and
          are counter-flipped by CSS when mirroring is on. */}
      <div className="camera-hud">{children}</div>
    </div>
  )
}
