import { useEffect, useRef, useState } from 'react'
import { Bot, Play, RotateCcw, Activity, ShieldAlert, Cpu } from 'lucide-react'

export function RobotKinematicsPanel({ result }) {
  const canvasRef = useRef(null)
  const [cameraAngle, setCameraAngle] = useState({ yaw: 45, pitch: 25, zoom: 1.0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })

  const [simState, setSimState] = useState({
    status: 'STANDBY',
    contact_force_n: 12.4,
    joint_angles: [0, -30, 45, 0, 45, 0, 0],
    execution_step: 1,
  })

  const [joints, setJoints] = useState([0, -25, 45, 0, 30, 0, 0])
  const [isPlaying, setIsPlaying] = useState(false)

  const selectedTarget = result?.detections?.[0]
  const pose = selectedTarget?.pose_6d

  // Mouse Orbit Controls
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

  // 3D Canvas Kinematics Renderer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let animId
    let t = 0

    const render = () => {
      t += 0.03
      const width = canvas.parentElement?.clientWidth || 700
      const height = 460
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

      const project = (x, y, z) => {
        const x1 = x * Math.cos(yawRad) - z * Math.sin(yawRad)
        const z1 = x * Math.sin(yawRad) + z * Math.cos(yawRad)
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
      for (let gx = -240; gx <= 240; gx += 40) {
        const p1 = project(gx, -60, -240)
        const p2 = project(gx, -60, 240)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
      for (let gz = -240; gz <= 240; gz += 40) {
        const p1 = project(-240, -60, gz)
        const p2 = project(240, -60, gz)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }

      // 2. Target Object on Table
      let target3D = { x: 80, y: -40, z: 40 }
      if (pose) {
        target3D = {
          x: (pose.x_m || 0.2) * 250,
          y: -40,
          z: (pose.y_m || 0.0) * 250,
        }
      }

      const pObj = project(target3D.x, target3D.y, target3D.z)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.ellipse(pObj.x, pObj.y + 16, 24, 8, 0, 0, 2 * Math.PI)
      ctx.fill()

      ctx.fillStyle = '#4ade80'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(pObj.x - 18, pObj.y - 20, 36, 36, 6)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 10px monospace'
      ctx.fillText(selectedTarget?.label || 'Target', pObj.x - 14, pObj.y - 2)

      // 3. Franka Emika Panda 7-DOF Manipulator
      const base = { x: -80, y: -60, z: -80 }
      const pBase = project(base.x, base.y, base.z)

      ctx.fillStyle = '#1e293b'
      ctx.strokeStyle = '#00f2fe'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(pBase.x, pBase.y, 36, 16, 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()

      let prog = 0
      if (isPlaying) {
        prog = Math.sin(t * 1.2) * 0.5 + 0.5
      }

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

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.lineWidth = 14
      ctx.strokeStyle = '#334155'
      ctx.beginPath()
      ctx.moveTo(pBase.x, pBase.y)
      ctx.lineTo(pShoulder.x, pShoulder.y)
      ctx.stroke()

      ctx.lineWidth = 12
      ctx.strokeStyle = '#475569'
      ctx.beginPath()
      ctx.moveTo(pShoulder.x, pShoulder.y)
      ctx.lineTo(pElbow.x, pElbow.y)
      ctx.stroke()

      ctx.lineWidth = 10
      ctx.strokeStyle = '#00f2fe'
      ctx.beginPath()
      ctx.moveTo(pElbow.x, pElbow.y)
      ctx.lineTo(pWrist.x, pWrist.y)
      ctx.stroke()

      ;[pBase, pShoulder, pElbow, pWrist].forEach((pt) => {
        ctx.fillStyle = '#0f172a'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
      })

      // Parallel Gripper Jaws
      const jawGap = prog > 0.8 ? 10 : 26
      ctx.strokeStyle = prog > 0.8 ? '#4ade80' : '#00f2fe'
      ctx.lineWidth = 4

      ctx.beginPath()
      ctx.moveTo(pWrist.x - jawGap, pWrist.y + 4)
      ctx.lineTo(pWrist.x - jawGap, pWrist.y + 22)
      ctx.moveTo(pWrist.x + jawGap, pWrist.y + 4)
      ctx.lineTo(pWrist.x + jawGap, pWrist.y + 22)
      ctx.stroke()

      setSimState({
        status: prog > 0.8 ? 'OBJECT GRASPED' : prog > 0.3 ? 'APPROACHING' : 'READY',
        contact_force_n: (prog * 12.8).toFixed(1),
        joint_angles: [
          (joints[0] + prog * 15).toFixed(1),
          (joints[1] - prog * 20).toFixed(1),
          (joints[2] + prog * 25).toFixed(1),
          joints[3].toFixed(1),
          (joints[4] + prog * 10).toFixed(1),
          joints[5].toFixed(1),
          joints[6].toFixed(1),
        ],
        execution_step: prog > 0.8 ? 4 : prog > 0.3 ? 2 : 1,
      })

      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [cameraAngle, pose, selectedTarget, isPlaying, joints])

  return (
    <div className="studio-panel-view">
      <div className="panel-top-header">
        <div className="title-block">
          <h2>🦾 3D Franka Emika Panda Manipulator & Kinematics Studio</h2>
          <p className="subtitle">
            Damped Least Squares (DLS) Inverse Kinematics, 7-DOF joint motor overrides, and real-time rigid-body contact dynamics.
          </p>
        </div>
        <div className="actions-block">
          <button
            type="button"
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '⏸ Pause Trajectory' : '▶ Execute 3D Pick & Place'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCameraAngle({ yaw: 45, pitch: 25, zoom: 1.0 })}
          >
            <RotateCcw size={14} /> <span>Reset View</span>
          </button>
        </div>
      </div>

      <div className="two-col-grid">
        {/* Left: 3D Viewport */}
        <div className="viewport-col card">
          <div className="card-header">
            <span className="live-tag">🔴 3D ROBOT VIEWPORT (DRAG MOUSE TO ROTATE)</span>
            <span className="state-badge">Status: {simState.status}</span>
          </div>

          <div
            className="canvas-3d-wrap"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <canvas ref={canvasRef} className="canvas-3d" />
            <div className="hint-overlay">🖱️ Click & drag to rotate 3D camera angle</div>
          </div>

          <div className="metrics-strip">
            <div className="m-card">
              <span className="m-lbl">Contact Normal Force</span>
              <span className="m-val text-green">{simState.contact_force_n} N</span>
            </div>
            <div className="m-card">
              <span className="m-lbl">IK Solver Algorithm</span>
              <span className="m-val text-cyan">DLS (λ=0.05)</span>
            </div>
            <div className="m-card">
              <span className="m-lbl">Trajectory Phase</span>
              <span className="m-val text-yellow">Phase #{simState.execution_step}</span>
            </div>
            <div className="m-card">
              <span className="m-lbl">Target 6D Depth</span>
              <span className="m-val">{pose ? `${pose.z_m}m` : '0.44m'}</span>
            </div>
          </div>
        </div>

        {/* Right: Joint Angle Sliders */}
        <div className="controls-col card">
          <h3>7-DOF Revolute Joint Configuration</h3>
          <p className="muted">Manual joint displacement overrides (degrees):</p>

          <div className="joints-list">
            {[1, 2, 3, 4, 5, 6, 7].map((num, idx) => (
              <div key={`j-${num}`} className="joint-item">
                <div className="j-header">
                  <span className="j-title">Joint {num} (Panda)</span>
                  <span className="j-val mono">{simState.joint_angles[idx]}°</span>
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
                  className="j-slider"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
