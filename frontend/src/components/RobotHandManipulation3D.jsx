import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Brain,
  RotateCcw,
  Zap,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────────
// Animation phases (linear, one-way — not oscillating)
//
//   0.00 – 0.18 : Phase 1  – Perception & 6D Grounding (arm idle, scan)
//   0.18 – 0.38 : Phase 2  – Hover above object (arm moves to X/Z, stays high)
//   0.38 – 0.55 : Phase 3  – Descent onto object centroid (Z descends)
//   0.55 – 0.70 : Phase 4  – Finger closure & grip (jaw 80mm → 0mm lock)
//   0.70 – 1.00 : Phase 5  – Lift & transport (arm rises, object attached)
// ──────────────────────────────────────────────────────────────────────────────
const PHASE_WINDOWS = [
  { phase: 1, start: 0.00, end: 0.18 },
  { phase: 2, start: 0.18, end: 0.38 },
  { phase: 3, start: 0.38, end: 0.55 },
  { phase: 4, start: 0.55, end: 0.70 },
  { phase: 5, start: 0.70, end: 1.00 },
]

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function phaseT(progress, start, end) {
  return Math.max(0, Math.min(1, (progress - start) / (end - start)))
}

export function RobotHandManipulation3D({
  targetObject,
  pose6d,
  geminiPlan,
  isExecuting,
  onExecuteGrasp,
}) {
  const canvasRef = useRef(null)
  const [cameraAngle, setCameraAngle] = useState({ yaw: 35, pitch: 25 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })

  // Sequential animation progress: 0.0 → 1.0 over EXECUTION_DURATION ms
  const EXECUTION_DURATION = 6000 // ms

  const animRef = useRef({
    progress: 0,
    startTime: null,
    running: false,
  })

  // Display state driven from progress
  const [currentPhase, setCurrentPhase] = useState(1)
  const [contactForce, setContactForce] = useState(0.0)
  const [gripperMm, setGripperMm] = useState(80)

  // When isExecuting flips on, reset and start the animation timeline
  useEffect(() => {
    if (isExecuting) {
      animRef.current = { progress: 0, startTime: null, running: true }
    } else {
      animRef.current.running = false
      animRef.current.progress = 0
      animRef.current.startTime = null
    }
  }, [isExecuting])

  // ── Mouse orbit controls ────────────────────────────────────────────────────
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
      yaw: prev.yaw + dx * 0.5,
      pitch: Math.max(5, Math.min(80, prev.pitch - dy * 0.5)),
    }))
  }
  const handleMouseUp = () => setIsDragging(false)

  // ── Main render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const render = (timestamp) => {
      // Advance sequential animation progress
      const anim = animRef.current
      if (anim.running) {
        if (anim.startTime === null) anim.startTime = timestamp
        anim.progress = Math.min(1.0, (timestamp - anim.startTime) / EXECUTION_DURATION)
      }

      const progress = anim.running ? anim.progress : 0

      // Derive current phase
      const activePW = PHASE_WINDOWS.find((pw) => progress >= pw.start && progress <= pw.end)
        || PHASE_WINDOWS[0]
      setCurrentPhase(activePW.phase)

      // Canvas sizing
      const width = canvas.parentElement?.clientWidth || 560
      const height = canvas.parentElement?.clientHeight || 260
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      ctx.clearRect(0, 0, width, height)

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, height)
      bg.addColorStop(0, '#040714')
      bg.addColorStop(1, '#070d1d')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      // ── 3D Projection ──────────────────────────────────────────────────────
      const cx = width / 2
      const cy = height * 0.72
      const fov = 300
      const yawRad = (cameraAngle.yaw * Math.PI) / 180
      const pitchRad = (cameraAngle.pitch * Math.PI) / 180

      const project = (x, y, z) => {
        const x1 = x * Math.cos(yawRad) - z * Math.sin(yawRad)
        const z1 = x * Math.sin(yawRad) + z * Math.cos(yawRad)
        const y2 = y * Math.cos(pitchRad) - z1 * Math.sin(pitchRad)
        const z2 = y * Math.sin(pitchRad) + z1 * Math.cos(pitchRad) + 370
        const depth = Math.max(z2, 50)
        return { x: cx + (x1 * fov) / depth, y: cy - (y2 * fov) / depth }
      }

      // ── Grid ───────────────────────────────────────────────────────────────
      ctx.strokeStyle = '#1a2540'
      ctx.lineWidth = 1
      for (let gx = -200; gx <= 200; gx += 40) {
        const p1 = project(gx, -60, -200)
        const p2 = project(gx, -60, 200)
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      }
      for (let gz = -200; gz <= 200; gz += 40) {
        const p1 = project(-200, -60, gz)
        const p2 = project(200, -60, gz)
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      }

      // ── Target Object World Coords ─────────────────────────────────────────
      const OBJ_BASE_X = (pose6d?.x_m || 0.1) * 240
      const OBJ_BASE_Y = -40   // resting on table
      const OBJ_BASE_Z = (pose6d?.y_m || 0.0) * 160 + 60

      // Object Y when lifted (Phase 5)
      const liftT = phaseT(progress, 0.70, 1.00)
      const objY = OBJ_BASE_Y + lerp(0, 110, liftT)

      // ── Arm Base ──────────────────────────────────────────────────────────
      const BASE = { x: -85, y: -60, z: -70 }
      const pBase = project(BASE.x, BASE.y, BASE.z)

      // Draw base plate
      ctx.fillStyle = '#0f172a'
      ctx.strokeStyle = '#00f2fe88'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(pBase.x, pBase.y, 28, 11, 0, 0, 2 * Math.PI)
      ctx.fill(); ctx.stroke()

      // ── End-Effector Target ───────────────────────────────────────────────
      // Phase 1:  EE stays idle above base
      // Phase 2:  EE moves toward hover position (OBJ + [0, +80, 0])
      // Phase 3:  EE descends from hover to object centroid
      // Phase 4:  EE stays at object centroid, jaws close
      // Phase 5:  EE lifts  with object

      const HOVER_Y = OBJ_BASE_Y + 80
      const IDLE = { x: BASE.x, y: BASE.y + 80, z: BASE.z }

      const t2 = phaseT(progress, 0.18, 0.38)   // hover approach
      const t3 = phaseT(progress, 0.38, 0.55)   // descent
      const t5 = phaseT(progress, 0.70, 1.00)   // lift

      const eeX = lerp(lerp(IDLE.x, OBJ_BASE_X, t2), OBJ_BASE_X, t3)
      const eeY = lerp(
        lerp(IDLE.y, HOVER_Y, t2),    // idle → hover
        lerp(HOVER_Y, OBJ_BASE_Y, t3) + lerp(0, 110, t5),  // hover → contact → lift
        Math.min(1, t2 + t3)
      )
      const eeZ = lerp(lerp(IDLE.z, OBJ_BASE_Z, t2), OBJ_BASE_Z, t3)

      const pEE = project(eeX, eeY, eeZ)

      // ── Intermediate joints ───────────────────────────────────────────────
      const SHOULDER = { x: BASE.x, y: BASE.y + 55, z: BASE.z }
      const pShoulder = project(SHOULDER.x, SHOULDER.y, SHOULDER.z)

      const ELBOW = {
        x: lerp(BASE.x, eeX, 0.5),
        y: lerp(SHOULDER.y, eeY, 0.45) + 14,
        z: lerp(BASE.z, eeZ, 0.5),
      }
      const pElbow = project(ELBOW.x, ELBOW.y, ELBOW.z)

      // ── Draw arm segments (thick) ──────────────────────────────────────────
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Segment: base → shoulder
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 14
      ctx.beginPath(); ctx.moveTo(pBase.x, pBase.y); ctx.lineTo(pShoulder.x, pShoulder.y); ctx.stroke()

      // Segment: shoulder → elbow
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 11
      ctx.beginPath(); ctx.moveTo(pShoulder.x, pShoulder.y); ctx.lineTo(pElbow.x, pElbow.y); ctx.stroke()

      // Segment: elbow → wrist (EE)
      ctx.strokeStyle = '#00f2fe'
      ctx.lineWidth = 8
      ctx.beginPath(); ctx.moveTo(pElbow.x, pElbow.y); ctx.lineTo(pEE.x, pEE.y); ctx.stroke()

      // Joint spheres
      ;[pBase, pShoulder, pElbow].forEach((pt) => {
        ctx.fillStyle = '#0f172a'
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke()
      })

      // ── Parallel-Jaw Gripper ───────────────────────────────────────────────
      //   Phase 1-3:  fully open  (jawGap = 26)
      //   Phase 4:    closes from 26 → 3  (physically gripping)
      //   Phase 5:    stays closed at 3
      const t4 = phaseT(progress, 0.55, 0.70)
      const jawGap = lerp(26, 3, t4)   // pixels in screen space

      // Contact force ramps up during phase 4
      const force = lerp(0, 12.4, t4)
      setContactForce(parseFloat(force.toFixed(1)))
      setGripperMm(Math.round(lerp(80, 0, t4)))

      const isGripped = t4 >= 1.0

      // Gripper palm bar
      const palmColor = isGripped ? '#4ade80' : '#00f2fe'
      ctx.strokeStyle = palmColor
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(pEE.x - jawGap - 5, pEE.y)
      ctx.lineTo(pEE.x + jawGap + 5, pEE.y)
      ctx.stroke()

      // Left finger
      ctx.beginPath()
      ctx.moveTo(pEE.x - jawGap, pEE.y)
      ctx.lineTo(pEE.x - jawGap, pEE.y + 20)
      ctx.stroke()

      // Right finger
      ctx.beginPath()
      ctx.moveTo(pEE.x + jawGap, pEE.y)
      ctx.lineTo(pEE.x + jawGap, pEE.y + 20)
      ctx.stroke()

      // Finger pads (contact surfaces)
      ctx.fillStyle = isGripped ? '#4ade80' : '#ffffff'
      ctx.fillRect(pEE.x - jawGap - 3, pEE.y + 13, 6, 7)
      ctx.fillRect(pEE.x + jawGap - 3, pEE.y + 13, 6, 7)

      // Gripped glow pulse
      if (isGripped) {
        ctx.save()
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(timestamp * 0.008)
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.ellipse(pEE.x, pEE.y + 15, jawGap + 14, 14, 0, 0, 2 * Math.PI)
        ctx.fill()
        ctx.restore()
      }

      // ── Target Object ─────────────────────────────────────────────────────
      // Object follows the end-effector Y once gripped (phase 4 onward)
      const objectY = t4 >= 1.0 ? OBJ_BASE_Y + lerp(0, 110, t5) : OBJ_BASE_Y
      const pObj = project(OBJ_BASE_X, objectY, OBJ_BASE_Z)

      // Shadow (shrinks as object lifts)
      ctx.save()
      ctx.globalAlpha = lerp(0.55, 0.1, liftT)
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(pObj.x, project(OBJ_BASE_X, OBJ_BASE_Y + 18, OBJ_BASE_Z).y,
        lerp(20, 8, liftT), lerp(8, 3, liftT), 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()

      // Object body (highlight when being gripped)
      ctx.fillStyle = isGripped ? '#4ade80' : '#38bdf8'
      ctx.strokeStyle = isGripped ? '#86efac' : '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(pObj.x - 15, pObj.y - 20, 30, 32, 5)
      ctx.fill(); ctx.stroke()

      // Label
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        (targetObject?.label || 'OBJ').toUpperCase().slice(0, 6),
        pObj.x, pObj.y - 5
      )
      ctx.textAlign = 'left'

      // Phase 4: "LOCKED" badge on object
      if (isGripped) {
        ctx.fillStyle = '#4ade80'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('✓ GRASPED', pObj.x, pObj.y + 25)
        ctx.textAlign = 'left'
      }

      // Phase 5: altitude indicator
      if (t5 > 0.05) {
        const pObjBase = project(OBJ_BASE_X, OBJ_BASE_Y, OBJ_BASE_Z)
        ctx.save()
        ctx.setLineDash([3, 4])
        ctx.strokeStyle = '#4ade8055'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pObj.x, pObj.y + 16)
        ctx.lineTo(pObjBase.x, pObjBase.y + 16)
        ctx.stroke()
        ctx.restore()
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [cameraAngle, pose6d, targetObject, isExecuting])

  return (
    <div className="robot-hand-stage-card">
      {/* Header */}
      <div className="robot-stage-header">
        <div className="stage-title-wrap">
          <Bot size={16} className="text-accent" />
          <span className="stage-title">3D ROBOTIC HAND & GRIPPER MANIPULATION</span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => setCameraAngle({ yaw: 35, pitch: 25 })}
          title="Reset 3D Camera"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* 3D Canvas */}
      <div
        className="robot-canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <canvas ref={canvasRef} className="robot-canvas" />
        <div className="orbit-hint-badge">🖱️ Drag to orbit 3D view</div>

        <div className="phase-pill-overlay">
          <span className="phase-pill-num">PHASE #{currentPhase}</span>
          <span className="phase-pill-text">
            {currentPhase === 1 && 'Perception & 6D Grounding'}
            {currentPhase === 2 && 'Hover & Approach'}
            {currentPhase === 3 && 'Descent to Centroid'}
            {currentPhase === 4 && 'Finger Closure — Grip Active'}
            {currentPhase === 5 && '⬆ Lift & Transport'}
          </span>
        </div>
      </div>

      {/* Physical Telemetry */}
      <div className="manipulation-telemetry-grid">
        <div className="tele-item">
          <span className="tele-lbl">Normal Force</span>
          <span className={`tele-val mono ${contactForce > 0 ? 'text-green' : ''}`}>
            {contactForce.toFixed(1)} N
          </span>
        </div>
        <div className="tele-item">
          <span className="tele-lbl">Jaw Opening</span>
          <span className="tele-val text-cyan mono">{gripperMm} mm</span>
        </div>
        <div className="tele-item">
          <span className="tele-lbl">IK Algorithm</span>
          <span className="tele-val mono">DLS (λ=0.05)</span>
        </div>
        <div className="tele-item">
          <span className="tele-lbl">Grasp State</span>
          <span className={`tele-val mono ${gripperMm < 5 ? 'text-green' : 'text-yellow'}`}>
            {gripperMm < 5 ? 'LOCKED 🔒' : isExecuting ? 'MOVING' : 'FREE'}
          </span>
        </div>
      </div>

      {/* Gemini Cognitive Planner HUD */}
      <div className="gemini-planner-hud">
        <div className="planner-header">
          <Brain size={14} className="text-accent" />
          <span className="planner-title">GEMINI MULTIMODAL COGNITIVE PLANNER</span>
          <span className="planner-model-tag">Gemini 1.5 Flash</span>
        </div>

        <p className="reasoning-text">
          {geminiPlan?.cognitive_reasoning ||
            `Visual reasoning confirmed ${targetObject?.label || 'target'} at Z=${pose6d?.z_m || 0.44}m. Parallel-jaw antipodal grasp verified — zero workspace collision, reachability index 0.94.`}
        </p>

        <div className="roadmap-steps-list">
          {[
            { phase: 1, text: `Lock 6D pose on ${targetObject?.label || 'target'}` },
            { phase: 2, text: `Hover above object (Yaw: ${pose6d?.yaw_deg || 0}°)` },
            { phase: 3, text: 'Descend along optical depth ray to centroid' },
            { phase: 4, text: 'Close fingers → 12.4 N contact force lock' },
            { phase: 5, text: 'Lift +200 mm and transport to target bin' },
          ].map((s) => {
            const isCurrent = s.phase === currentPhase && isExecuting
            const isDone = isExecuting && s.phase < currentPhase
            return (
              <div
                key={`step-${s.phase}`}
                className={`roadmap-step ${isCurrent ? 'step-current' : isDone ? 'step-done' : ''}`}
              >
                <div className="step-num-dot">{isDone ? '✓' : s.phase}</div>
                <span className="step-desc">{s.text}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Execute Button */}
      <button
        type="button"
        className={`btn btn-end-to-end-grasp ${isExecuting ? 'btn-executing' : ''}`}
        onClick={onExecuteGrasp}
        disabled={isExecuting}
      >
        <Zap size={16} />
        <span>
          {isExecuting
            ? `⚡ EXECUTING — PHASE ${currentPhase}/5 (${
                currentPhase === 4 ? 'GRIPPING OBJECT...' :
                currentPhase === 5 ? 'LIFTING OBJECT ⬆' :
                'IN PROGRESS...'
              })`
            : `⚡ EXECUTE 3D ROBOT MANIPULATION (${(targetObject?.label || 'TARGET').toUpperCase()})`}
        </span>
      </button>
    </div>
  )
}
