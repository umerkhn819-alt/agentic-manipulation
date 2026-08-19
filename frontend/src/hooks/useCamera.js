import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Manage the webcam lifecycle: request access, attach the stream, clean up on unmount.
 *
 * Returns real browser errors in plain language — a denied permission is a very different
 * problem from no camera being present, and the UI should say which one happened.
 */
export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('idle') // idle | starting | live | error
  const [error, setError] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const stop = useCallback(() => {
    if (streamRef.current) {
      // Releasing every track is what actually turns the camera light off.
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
    setDimensions({ width: 0, height: 0 })
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('starting')

    // getUserMedia only exists in secure contexts (https, or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError(
        'This browser will not expose the camera here. getUserMedia needs a secure ' +
          'context — use http://localhost (not a LAN IP) or serve over HTTPS.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // Prefer a rear camera when there is one.
        },
        audio: false,
      })

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        // Component unmounted while the permission prompt was open.
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      video.srcObject = stream
      await video.play()

      // videoWidth is only populated once metadata has loaded.
      const applyDimensions = () => {
        setDimensions({ width: video.videoWidth, height: video.videoHeight })
        setStatus('live')
      }

      if (video.videoWidth) {
        applyDimensions()
      } else {
        video.addEventListener('loadedmetadata', applyDimensions, { once: true })
      }
    } catch (err) {
      setStatus('error')
      // Translate the DOMException names into something actionable.
      const messages = {
        NotAllowedError:
          'Camera permission was denied. Click the camera icon in your browser’s address ' +
          'bar and allow access, then press Start Camera again.',
        NotFoundError: 'No camera was found on this device.',
        NotReadableError:
          'The camera is already in use by another application (Zoom, Teams, OBS…). ' +
          'Close that app and try again.',
        OverconstrainedError:
          'No camera matched the requested resolution. This is unusual — try a different camera.',
        SecurityError: 'Camera access was blocked by the browser’s security settings.',
      }
      setError(messages[err.name] || `Could not start the camera: ${err.name} — ${err.message}`)
    }
  }, [])

  // Always release the camera when the component goes away.
  useEffect(() => stop, [stop])

  return { videoRef, status, error, dimensions, start, stop }
}
