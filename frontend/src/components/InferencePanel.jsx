import React from 'react'

/**
 * Inference Engine (XAI) Panel.
 * Displays candidate scores, utility breakdown, decision logs, and reasoning trace.
 */
export function InferencePanel({ inference, result }) {
  if (!inference) {
    return (
      <div className="panel inference-panel empty-inference">
        <div className="panel-header">
          <h3>🧠 Multi-Criteria Decision & Inference Engine</h3>
          <span className="badge badge-idle">Awaiting Pipeline Execution</span>
        </div>
        <p className="muted">
          Press <strong>"START AUTOMATED DEMO"</strong> to execute vision analysis and view real-time candidate grasp rankings & reasoning trace.
        </p>
      </div>
    )
  }

  const { selected_target, confidence_score, rankings, reasoning_trace, ai_summary } = inference

  return (
    <div className="panel inference-panel">
      <div className="panel-header">
        <h3>🧠 Multi-Criteria Decision & Inference Engine</h3>
        <span className="badge badge-active">Decision Output Active</span>
      </div>

      {selected_target ? (
        <div className="decision-banner">
          <div className="decision-main">
            <span className="decision-label">OPTIMAL TARGET SELECTED:</span>
            <span className="decision-target">{selected_target.toUpperCase()}</span>
          </div>
          <div className="decision-score">
            <span className="score-val">{confidence_score}%</span>
            <span className="score-lbl">Quality Index</span>
          </div>
        </div>
      ) : (
        <div className="decision-banner banner-warning">
          <span>NO VALID TARGET DETECTED IN WORKSPACE</span>
        </div>
      )}

      {ai_summary && (
        <div className="ai-summary-box">
          <strong>Summary:</strong> {ai_summary}
        </div>
      )}

      {rankings && rankings.length > 0 && (
        <div className="rankings-section">
          <h4>Candidate Grasp Ranking & Utility Breakdown</h4>
          <div className="rankings-list">
            {rankings.map((c) => (
              <div key={`cand-${c.index}`} className={`candidate-card ${c.selected ? 'card-selected' : ''}`}>
                <div className="card-top">
                  <span className="cand-name">
                    {c.selected ? '🏆 ' : ''}
                    #{c.index + 1} {c.label}
                  </span>
                  <span className="cand-score">{c.total_score}% Score</span>
                </div>

                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${c.total_score}%` }} />
                </div>

                <div className="metrics-grid">
                  <div className="metric">
                    <span className="m-lbl">Vision Conf:</span>
                    <span className="m-val">{c.vision_score}%</span>
                  </div>
                  <div className="metric">
                    <span className="m-lbl">Mask IoU:</span>
                    <span className="m-val">{c.mask_score}%</span>
                  </div>
                  <div className="metric">
                    <span className="m-lbl">Jaw Fit:</span>
                    <span className="m-val">{c.jaw_fit_score}%</span>
                  </div>
                  <div className="metric">
                    <span className="m-lbl">Centering:</span>
                    <span className="m-val">{c.centering_score}%</span>
                  </div>
                </div>

                {result?.detections?.[c.index]?.pose_6d && (
                  <div className="pose-6d-row">
                    <span className="p6-lbl">📐 6D Pose:</span>
                    <span className="p6-val mono">
                      X:{result.detections[c.index].pose_6d.x_m}m Y:{result.detections[c.index].pose_6d.y_m}m Z:{result.detections[c.index].pose_6d.z_m}m
                    </span>
                  </div>
                )}

                {c.collision_risk && (
                  <div className="collision-warning">
                    ⚠️ Potential collision overlap with secondary bounding box
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      )}

      {reasoning_trace && reasoning_trace.length > 0 && (
        <div className="reasoning-trace-section">
          <h4>Explainable AI (XAI) Reasoning Trace</h4>
          <div className="terminal-feed">
            {reasoning_trace.map((step, idx) => (
              <div key={`trace-${idx}`} className="trace-line">
                <span className="trace-prompt">&gt;</span> {step}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
