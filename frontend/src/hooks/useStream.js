import { useCallback, useEffect, useRef, useState } from 'react'

import { captureFrame } from '../lib/api'

/**
 * Continuous detection over a WebSocket.
 *
 * BACKPRESSURE — the important part:
 * Frames are NEVER queued. A tick fires on an interval, but a frame is only sent when no
 * response is outstanding. If inference is still running, that tick is counted as a skip
 * and discarded.
 *
 * This matters here because inference takes several seconds while the interval is 1s. A
 * naive "send every second" loop would build an ever-growing backlog, and the boxes you saw
 * would drift further and further behind what the camera is actually pointing at. Skipping
 * keeps results tied to the present moment: latency stays flat and only the skip counter
 * grows.
 */
export function useStream({ videoRef, prompt, zeroShot, segment, grasp, onResult }) {
  const socketRef = useRef(null)
  const timerRef = useRef(null)
  // True from the moment a frame is sent until its reply arrives. The whole backpressure
  // scheme is this one flag.
  const inFlightRef = useRef(false)
  const sentAtRef = useRef(0)
  const frameIdRef = useRef(0)

  // Latest settings, read at send time so changing the prompt mid-stream takes effect
  // without tearing down and restarting the socket.
  const settingsRef = useRef({ prompt, zeroShot, segment, grasp })
  useEffect(() => {
    settingsRef.current = { prompt, zeroShot, segment, grasp }
  }, [prompt, zeroShot, segment, grasp])

  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState({
    sent: 0,
    received: 0,
    skipped: 0,
    errors: 0,
    lastMs: null,
    avgMs: null,
  })

  const statsRef = useRef(stats)
  const updateStats = useCallback((changes) => {
    statsRef.current = { ...statsRef.current, ...changes }
    setStats(statsRef.current)
  }, [])

  // Rolling window of real round-trip times, for the average.
  const latenciesRef = useRef([])

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (socketRef.current) {
      // Detach handlers first so the close does not fire an "unexpected disconnect" error.
      socketRef.current.onclose = null
      socketRef.current.onerror = null
      socketRef.current.onmessage = null
      if (
        socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING
      ) {
        socketRef.current.close()
      }
      socketRef.current = null
    }
    inFlightRef.current = false
    setStreaming(false)
  }, [])

  const start = useCallback(() => {
    if (socketRef.current) return

    // Same-origin ws:// URL, so the Vite proxy forwards it to the backend.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/stream`)
    socketRef.current = socket

    // Reset counters for a fresh session.
    latenciesRef.current = []
    statsRef.current = { sent: 0, received: 0, skipped: 0, errors: 0, lastMs: null, avgMs: null }
    setStats(statsRef.current)

    socket.onopen = () => {
      setStreaming(true)

      const tick = () => {
        // THE BACKPRESSURE RULE: never send while a response is outstanding.
        if (inFlightRef.current) {
          updateStats({ skipped: statsRef.current.skipped + 1 })
          return
        }
        if (socket.readyState !== WebSocket.OPEN) return
        if (!videoRef.current?.videoWidth) return

        let image
        try {
          image = captureFrame(videoRef.current, 0.8)
        } catch {
          return // Camera not ready this tick; try again on the next one.
        }

        const { prompt, zeroShot, segment, grasp } = settingsRef.current
        inFlightRef.current = true
        sentAtRef.current = performance.now()

        socket.send(
          JSON.stringify({
            image,
            prompt,
            zero_shot: zeroShot,
            segment,
            grasp,
            frame_id: ++frameIdRef.current,
          }),
        )
        updateStats({ sent: statsRef.current.sent + 1 })
      }

      tick() // Send the first frame immediately rather than waiting a full second.
      timerRef.current = setInterval(tick, 1000)
    }

    socket.onmessage = (event) => {
      // Real measured round trip — start to finish, not an estimate.
      const elapsed = performance.now() - sentAtRef.current
      inFlightRef.current = false

      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        updateStats({ errors: statsRef.current.errors + 1 })
        return
      }

      latenciesRef.current.push(elapsed)
      if (latenciesRef.current.length > 20) latenciesRef.current.shift()
      const avg =
        latenciesRef.current.reduce((sum, value) => sum + value, 0) / latenciesRef.current.length

      updateStats({
        received: statsRef.current.received + 1,
        errors: payload.ok ? statsRef.current.errors : statsRef.current.errors + 1,
        lastMs: Math.round(elapsed),
        avgMs: Math.round(avg),
      })

      onResultRef.current?.(payload)
    }

    socket.onerror = () => {
      onResultRef.current?.({
        ok: false,
        detections: [],
        error: {
          stage: 'network',
          message:
            'WebSocket error. Is the backend still running?\n' +
            'Check the terminal running `python run.py`.',
        },
      })
    }

    socket.onclose = () => {
      // Only reached for an unexpected close; stop() detaches this handler first.
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      inFlightRef.current = false
      socketRef.current = null
      setStreaming(false)
    }
  }, [videoRef, updateStats])

  // Always tear the socket down when the component goes away.
  useEffect(() => stop, [stop])

  return { streaming, stats, start, stop }
}
