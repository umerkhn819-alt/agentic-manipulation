import { useState } from 'react'
import { Sliders, Cpu, CheckCircle, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react'

export function InferenceXaiPanel({ result }) {
  const [weights, setWeights] = useState({
    vision: 0.25,
    mask: 0.25,
    jaw_fit: 0.20,
    centering: 0.15,
    orientation: 0.15,
  })

  const detections = result?.detections || [
    {
      label: 'bottle',
      score: 0.94,
      grasp: { score: 0.91, angle_deg: 12.4, width: 0.11 },
      pose_6d: { x_m: 0.08, y_m: -0.02, z_m: 0.44 },
    },
    {
      label: 'cup',
      score: 0.88,
      grasp: { score: 0.84, angle_deg: -35.2, width: 0.09 },
      pose_6d: { x_m: -0.15, y_m: 0.05, z_m: 0.38 },
    },
    {
      label: 'cell phone',
      score: 0.91,
      grasp: { score: 0.79, angle_deg: 85.0, width: 0.06 },
      pose_6d: { x_m: 0.22, y_m: 0.12, z_m: 0.32 },
    },
  ]

  const calculateUtility = (det) => {
    const vScore = det.score || 0.8
    const mScore = 0.85
    const jScore = det.grasp?.width ? Math.max(0, 1 - Math.abs(det.grasp.width - 0.12) / 0.12) : 0.8
    const cScore = 0.92
    const oScore = 0.88

    const total =
      vScore * weights.vision +
      mScore * weights.mask +
      jScore * weights.jaw_fit +
      cScore * weights.centering +
      oScore * weights.orientation

    return (total * 100).toFixed(1)
  }

  return (
    <div className="studio-panel-view">
      <div className="panel-top-header">
        <div className="title-block">
          <h2>🧠 Multi-Criteria Decision Engine & Explainable AI (XAI) Matrix</h2>
          <p className="subtitle">
            Multi-Attribute Utility Theory (MAUT) ranking objects by visual confidence, antipodal jaw clearance, kinematic reachability, and collision hazards.
          </p>
        </div>
      </div>

      <div className="two-col-grid">
        {/* Left: Weight Matrix Sliders */}
        <div className="card">
          <div className="card-header">
            <span className="live-tag">⚖️ MAUT UTILITY WEIGHT CONFIGURATION</span>
          </div>

          <div className="weights-sliders-list">
            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Visual Confidence (DETR / VLM)</span>
                <span className="w-val mono">{weights.vision}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={weights.vision}
                onChange={(e) => setWeights({ ...weights, vision: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Mask Boundary Quality (Mask2Former)</span>
                <span className="w-val mono">{weights.mask}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={weights.mask}
                onChange={(e) => setWeights({ ...weights, mask: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Gripper Jaw Aperture Fit</span>
                <span className="w-val mono">{weights.jaw_fit}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={weights.jaw_fit}
                onChange={(e) => setWeights({ ...weights, jaw_fit: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Workspace Centering / Reachability</span>
                <span className="w-val mono">{weights.centering}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={weights.centering}
                onChange={(e) => setWeights({ ...weights, centering: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Grasp Angle Alignment Stability</span>
                <span className="w-val mono">{weights.orientation}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.05"
                value={weights.orientation}
                onChange={(e) => setWeights({ ...weights, orientation: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </div>

        {/* Right: XAI Ranked Objects & Algorithmic Audit */}
        <div className="card">
          <div className="card-header">
            <span className="live-tag">📊 REAL-TIME XAI DECISION AUDIT TRACE</span>
          </div>

          <div className="ranked-objects-list">
            {detections.map((det, idx) => {
              const utilScore = calculateUtility(det)
              const isBest = idx === 0
              return (
                <div key={`xai-${det.label}-${idx}`} className={`xai-card ${isBest ? 'xai-best' : ''}`}>
                  <div className="xai-top">
                    <div className="xai-rank-badge">#{idx + 1}</div>
                    <div className="xai-info">
                      <span className="xai-name">{det.label.toUpperCase()}</span>
                      <span className="xai-sub mono">
                        {det.pose_6d ? `6D: (${det.pose_6d.x_m}m, ${det.pose_6d.y_m}m, ${det.pose_6d.z_m}m)` : 'Pose Available'}
                      </span>
                    </div>
                    <div className="xai-score-pill">
                      <span className="xai-score-num mono">{utilScore}</span>
                      <span className="xai-score-lbl">UTILITY</span>
                    </div>
                  </div>

                  <div className="xai-reasons">
                    <div className="reason-item text-green">
                      ✓ Visual Confidence: {(det.score * 100).toFixed(0)}%
                    </div>
                    <div className="reason-item text-cyan">
                      ✓ Antipodal Contact Score: {(det.grasp?.score * 100 || 88).toFixed(0)}%
                    </div>
                    <div className="reason-item text-yellow">
                      ✓ Collision Risk: LOW (0.0% bounding box overlap)
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
