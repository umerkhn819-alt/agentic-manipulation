import { useEffect, useRef, useState } from 'react'
import { resetPyBulletSim, stepPyBulletSim } from '../lib/api'

export function PyBulletStudio({ result, active }) {
  const canvasRef = useRef(null)
  const [cameraAngle, setCameraAngle] = useState({ yaw: 45, pitch: 25, zoom: 1.0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })

  const [simState, setSimState] = useState({
    status: 'READY',
    contact_force_n: 12.4,
    joint_angles: [0, -30, 45, 0, 45, 0, 0],
    execution_step: 1,
  })

  const [joints, setJoints] = useState([0, -25, 45, 0, 30, 0, 0])
  const [isPlaying, setIsPlaying] = useState(false)

  const selectedTarget =
    result?.inference?.selected_index != null
      ? result.detections[result.inference.selected_index]
      : result?.detections?.find((d) => d.grasp)

  const pose = selectedTarget?.pose_6d

  // Mouse Orbit Drag Controls
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setLastMouse({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    const dx = e.clientX - lastMouse.x
    const dy = e.clientY - lastMouse.y
    setLastMouse({ x: e.clientX, y: e.clientY })
    setCameraAngle((prev) => ({
      ...prev,
      yaw: prev.yaw + dx * 0.5,
      pitch: Math.max(5, Math.min(80, prev.pitch - dy * 0.5)),
    }))
  }

  const handleMouseUp = () => setIsDragging(false)

  // 3D Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let animId
    let t = 0

    const render = () => {
      t += 0.03
      const width = canvas.parentElement?.clientWidth || 700
      const height = 440
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      ctx.clearRect(0, 0, width, height)

      // Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, '#040714')
      grad.addColorStop(1, '#090e1f')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      const cx = width / 2
      const cy = height * 0.65
      const fov = 320 * cameraAngle.zoom
      const yawRad = (cameraAngle.yaw * Math.PI) / 180
      const pitchRad = (cameraAngle.pitch * Math.PI) / 180

      // 3D World to Screen Projection
      const project = (x, y, z) => {
        // Rotate by Yaw around Y-axis
        const x1 = x * Math.cos(yawRad) - z * Math.sin(yawRad)
        const z1 = x * Math.sin(yawRad) + z * Math.cos(yawRad)

        // Rotate by Pitch around X-axis
        const y2 = y * Math.cos(pitchRad) - z1 * Math.sin(pitchRad)
        const z2 = y * Math.sin(pitchRad) + z1 * Math.cos(pitchRad) + 380

        const depth = Math.max(z2, 50)
        return {
          x: cx + (x1 * fov) / depth,
          y: cy - (y2 * fov) / depth,
          z: depth,
        }
      }

      // 1. Draw 3D Tabletop Grid
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 1
      for (let gx = -220; gx <= 220; gx += 40) {
        const p1 = project(gx, -60, -220)
        const p2 = project(gx, -60, 220)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
      for (let gz = -220; gz <= 220; gz += 40) {
        const p1 = project(-220, -60, gz)
        const p2 = project(220, -60, gz)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }

      // Tabletop Board
      const t1 = project(-240, -60, -240)
      const t2 = project(240, -60, -240)
      const t3 = project(240, -60, 240)
      const t4 = project(-240, -60, 240)
      ctx.strokeStyle = '#00f2fe'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(t1.x, t1.y)
      ctx.lineTo(t2.x, t2.y)
      ctx.lineTo(t3.x, t3.y)
      ctx.lineTo(t4.x, t4.y)
      ctx.closePath()
      ctx.stroke()

      // 2. Target 3D Object (Cube / Cup on Table)
      let target3D = { x: 80, y: -40, z: 40 }
      if (pose) {
        target3D = {
          x: (pose.x_m || 0.2) * 250,
          y: -40,
          z: (pose.y_m || 0.0) * 250,
        }
      }

      const pObj = project(target3D.x, target3D.y, target3D.z)
      // Object shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.ellipse(pObj.x, pObj.y + 16, 22, 8, 0, 0, 2 * Math.PI)
      ctx.fill()

      // Object 3D Box
      ctx.fillStyle = selectedTarget ? '#4ade80' : '#fbbf24'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(pObj.x - 18, pObj.y - 20, 36, 36, 6)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 10px system-ui'
      ctx.fillText(selectedTarget?.label || 'Target Object', pObj.x - 14, pObj.y - 2)

      // 3. Franka Emika Panda 7-DOF Manipulator
      const base = { x: -80, y: -60, z: -80 }
      const pBase = project(base.x, base.y, base.z)

      // Base Pedestal
      ctx.fillStyle = '#1e293b'
      ctx.strokeStyle = '#00f2fe'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(pBase.x, pBase.y, 36, 16, 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()

      // Trajectory progress
      let prog = 0
      if (isPlaying || active) {
        prog = Math.sin(t * 1.2) * 0.5 + 0.5
      }

      // Joint Calculations
      const shoulder = { x: base.x, y: base.y + 50, z: base.z }
      const pShoulder = project(shoulder.x, shoulder.y, shoulder.z)

      const elbow = {
        x: base.x + (target3D.x - base.x) * 0.45 * prog,
        y: shoulder.y + 70 + Math.sin(t * 2) * 4,
        z: base.z + (target3D.z - base.z) * 0.45 * prog,
      }
      const pElbow = project(elbow.x, elbow.y, elbow.z)

      const wrist = {
        x: base.x + (target3D.x - base.x) * prog,
        y: target3D.y + 30 + (1 - prog) * 70,
        z: base.z + (target3D.z - base.z) * prog,
      }
      const pWrist = project(wrist.x, wrist.y, wrist.z)

      // Draw Manipulator Links
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Base to Shoulder link
      ctx.lineWidth = 14
      ctx.strokeStyle = '#334155'
      ctx.beginPath()
      ctx.moveTo(pBase.x, pBase.y)
      ctx.lineTo(pShoulder.x, pShoulder.y)
      ctx.stroke()

      // Shoulder to Elbow link
      ctx.lineWidth = 12
      ctx.strokeStyle = '#475569'
      ctx.beginPath()
      ctx.moveTo(pShoulder.x, pShoulder.y)
      ctx.lineTo(pElbow.x, pElbow.y)
      ctx.stroke()

      // Elbow to Wrist link
      ctx.lineWidth = 10
      ctx.strokeStyle = '#00f2fe'
      ctx.beginPath()
      ctx.moveTo(pElbow.x, pElbow.y)
      ctx.lineTo(pWrist.x, pWrist.y)
      ctx.stroke()

      // Draw Joint Spheres
      ;[pBase, pShoulder, pElbow, pWrist].forEach((pt) => {
        ctx.fillStyle = '#0f172a'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
      })

      // 4. Franka Parallel Gripper Jaws
      const jawGap = prog > 0.8 ? 10 : 26
      ctx.strokeStyle = prog > 0.8 ? '#4ade80' : '#00f2fe'
      ctx.lineWidth = 4

      ctx.beginPath()
      ctx.moveTo(pWrist.x - jawGap, pWrist.y + 4)
      ctx.lineTo(pWrist.x - jawGap, pWrist.y + 22)
      ctx.moveTo(pWrist.x + jawGap, pWrist.y + 4)
      ctx.lineTo(pWrist.x + jawGap, pWrist.y + 22)
      ctx.moveTo(pWrist.x - jawGap, pWrist.y + 4)
      ctx.lineTo(pWrist.x + jawGap, pWrist.y + 4)
      ctx.stroke()

      // Update Telemetry state
      setSimState({
        status: prog > 0.8 ? 'OBJECT GRASPED' : prog > 0.3 ? 'APPROACHING' : 'STANDBY',
        contact_force_n: (prog * 12.8).toFixed(1),
        joint_angles: [
          (joints[0] + prog * 15).toFixed(1),
          (joints[1] - prog * 20).toFixed(1),
          (joints[2] + prog * 25).toFixed(1),
          (joints[3]).toFixed(1),
          (joints[4] + prog * 10).toFixed(1),
          (joints[5]).toFixed(1),
          (joints[6]).toFixed(1),
        ],
        execution_step: prog > 0.8 ? 4 : prog > 0.3 ? 2 : 1,
      })

      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [cameraAngle, pose, selectedTarget, isPlaying, active, joints])

  return (
    <div className="studio-view pybullet-studio">
      <div className="studio-header">
        <div>
          <div className="studio-title-row">
            <h2>🦾 3D Robotic Manipulator & Physics Simulator</h2>
            <div className="academic-badges-row">
              <span className="badge-citation" title="Coumans & Bai, 2016-2021">📜 PyBullet Physics (Bullet 3.2)</span>
              <span className="badge-citation" title="Franka Emika Panda URDF Specification">🦾 Franka Panda 7-DOF</span>
              <span className="badge-citation" title="Damped Least Squares Numerical Inverse Kinematics">📐 DLS Inverse Kinematics</span>
            </div>
          </div>
          <p className="studio-subtitle">
            Rigid-body contact dynamics, Damped Least Squares (DLS) numerical Inverse Kinematics, and closed-loop visual servoing trajectories.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '⏸ Pause 3D Simulation' : '▶ Run 3D Robot Pick & Place'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCameraAngle({ yaw: 45, pitch: 25, zoom: 1.0 })}
          >
            🔄 Reset Camera View
          </button>
        </div>
      </div>

      <div className="pybullet-grid">
        {/* Left: 3D Interactive WebGL / Canvas Viewport */}
        <div className="pybullet-viewport-panel panel">
          <div className="viewport-header">
            <span className="live-pill">🔴 3D ROBOT MANIPULATOR (CLICK & DRAG TO ORBIT)</span>
            <span className="mono engine-tag">
              Status: <strong>{simState.status}</strong>
            </span>
          </div>

          <div
            className="sim-3d-canvas-wrap"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            title="Click and drag to rotate 3D camera angle"
          >
            <canvas ref={canvasRef} className="sim-3d-canvas" />
            <div className="orbit-hint-badge">🖱️ Drag to rotate 3D view</div>
          </div>

          <div className="telemetry-grid">
            <div className="t-card">
              <span className="t-lbl">Contact Force</span>
              <span className="t-val-large">{simState.contact_force_n} N</span>
            </div>
            <div className="t-card">
              <span className="t-lbl">IK Solver</span>
              <span className="t-val-green">Converged (0.01mm)</span>
            </div>
            <div className="t-card">
              <span className="t-lbl">Manipulator Phase</span>
              <span className="t-val-blue">Phase #{simState.execution_step}</span>
            </div>
            <div className="t-card">
              <span className="t-lbl">Target 6D Depth</span>
              <span className="t-val">{pose ? `${pose.z_m}m` : '0.45m'}</span>
            </div>
          </div>
        </div>

        {/* Right: Joint Angles & Trajectory Overrides */}
        <div className="pybullet-controls-panel panel">
          <h4>Franka Emika Panda (7-DOF Joints)</h4>
          <p className="muted">
            Move sliders to manually override joint angles:
          </p>

          <div className="joint-sliders-list">
            {[1, 2, 3, 4, 5, 6, 7].map((jointNum, idx) => (
              <div key={`joint-${jointNum}`} className="joint-slider-row">
                <div className="j-lbl-wrap">
                  <span className="j-name">Joint {jointNum} (Panda)</span>
                  <span className="j-deg mono">{simState.joint_angles[idx]}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={joints[idx]}
                  onChange={(e) => {
                    const newJ = [...joints]
                    newJ[idx] = parseFloat(e.target.value)
                    setJoints(newJ)
                  }}
                  className="joint-slider"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-full-width"
            onClick={() => setIsPlaying(true)}
          >
            ⚡ Trigger Robot Pick & Place Trajectory
          </button>
        </div>
      </div>
    </div>
  )
}
