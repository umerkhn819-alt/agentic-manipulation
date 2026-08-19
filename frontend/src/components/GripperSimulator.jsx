import { useEffect, useRef, useState } from 'react'

/**
 * Animated Parallel-Jaw Robotic Gripper Simulator.
 * Renders an animated virtual robotic arm/gripper approaching target object,
 * aligning to orientation angle theta, closing jaws to contact points A/B,
 * and displaying execution confirmation.
 */
export function GripperSimulator({ result, dimensions, active }) {
  const canvasRef = useRef(null)
  const [executionState, setExecutionState] = useState('idle') // idle, approach, rotate, close, complete

  const selectedTarget = result?.inference?.selected_index != null
    ? result.detections[result.inference.selected_index]
    : result?.detections?.find((d) => d.grasp)

  useEffect(() => {
    if (!active || !selectedTarget || !selectedTarget.grasp) {
      setExecutionState('idle')
      return
    }

    // Trigger animation sequence
    setExecutionState('approach')

    const t1 = setTimeout(() => setExecutionState('rotate'), 600)
    const t2 = setTimeout(() => setExecutionState('close'), 1200)
    const t3 = setTimeout(() => setExecutionState('complete'), 1800)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [selectedTarget, active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const width = dimensions.width || 640
    const height = dimensions.height || 480

    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)

    if (!selectedTarget || !selectedTarget.grasp || executionState === 'idle') {
      return
    }

    const grasp = selectedTarget.grasp
    const gx = grasp.x * width
    const gy = grasp.y * height
    const angleRad = (grasp.angle_deg * Math.PI) / 180.0
    const jawWidthPx = grasp.width_norm * width

    // Animation progress calculations
    let homeX = width * 0.1
    let homeY = height * 0.1

    let currentX = homeX
    let currentY = homeY
    let currentAngle = 0
    let currentJawOpen = jawWidthPx * 1.8

    if (executionState === 'approach') {
      currentX = gx
      currentY = gy
      currentAngle = 0
    } else if (executionState === 'rotate') {
      currentX = gx
      currentY = gy
      currentAngle = angleRad
    } else if (executionState === 'close' || executionState === 'complete') {
      currentX = gx
      currentY = gy
      currentAngle = angleRad
      currentJawOpen = jawWidthPx
    }

    ctx.save()
    ctx.translate(currentX, currentY)
    ctx.rotate(currentAngle)

    // Draw Gripper Body Mount
    ctx.fillStyle = '#1e293b'
    ctx.strokeStyle = '#00f2fe'
    ctx.lineWidth = 3

    ctx.beginPath()
    ctx.roundRect(-25, -45, 50, 30, 6)
    ctx.fill()
    ctx.stroke()

    // Draw Palm Axis
    ctx.beginPath()
    ctx.moveTo(-currentJawOpen / 2 - 10, -15)
    ctx.lineTo(currentJawOpen / 2 + 10, -15)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 6
    ctx.stroke()

    // Draw Left Jaw Finger
    ctx.fillStyle = executionState === 'complete' ? '#4ade80' : '#00f2fe'
    ctx.beginPath()
    ctx.roundRect(-currentJawOpen / 2 - 12, -15, 12, 40, 4)
    ctx.fill()
    ctx.stroke()

    // Draw Right Jaw Finger
    ctx.beginPath()
    ctx.roundRect(currentJawOpen / 2, -15, 12, 40, 4)
    ctx.fill()
    ctx.stroke()

    // Contact Point Pings when closed
    if (executionState === 'close' || executionState === 'complete') {
      ctx.fillStyle = '#ff4b4b'
      ctx.beginPath()
      ctx.arc(-currentJawOpen / 2, 20, 5, 0, 2 * Math.PI)
      ctx.arc(currentJawOpen / 2, 20, 5, 0, 2 * Math.PI)
      ctx.fill()
    }

    ctx.restore()
  }, [dimensions, selectedTarget, executionState])

  return (
    <div className="gripper-simulator-container">
      <canvas ref={canvasRef} className="simulator-canvas" />
      {executionState !== 'idle' && (
        <div className={`simulator-status-overlay status-${executionState}`}>
          {executionState === 'approach' && '🤖 Gripper Trajectory Approach...'}
          {executionState === 'rotate' && '📐 Aligning Jaw Orientation Angle...'}
          {executionState === 'close' && '⚙️ Closing Gripper Jaws...'}
          {executionState === 'complete' && '✅ GRASP EXECUTED SUCCESSFULLY'}
        </div>
      )}
    </div>
  )
}
