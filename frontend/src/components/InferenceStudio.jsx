export function InferenceStudio({ inference, result, weights, onWeightsChange, onRecompute }) {
  const { selected_target, confidence_score, rankings, reasoning_trace, ai_summary } =
    inference || {}

  const handleSliderChange = (key, val) => {
    const updated = { ...weights, [key]: parseFloat(val) }
    onWeightsChange(updated)
    if (onRecompute) onRecompute(updated)
  }

  return (
    <div className="studio-view inference-studio">
      <div className="studio-header">
        <div>
          <div className="studio-title-row">
            <h2>🧠 Multi-Criteria Decision & Inference Analytics Suite</h2>
            <div className="academic-badges-row">
              <span className="badge-citation" title="Keeney & Raiffa, Cambridge 1993">📜 MAUT Theory (1993)</span>
              <span className="badge-citation" title="Albu-Schäffer et al., 2007">🛡️ Collision Safety Barrier</span>
              <span className="badge-citation" title="Formal Pareto-Optimal Selection">📐 Pareto-Optimal Grasp Ranking</span>
            </div>
          </div>
          <p className="studio-subtitle">
            Explainable AI (XAI) Multi-Attribute Utility Theory (MAUT) formulation with dynamic Pareto objective weighting and deterministic audit logs.
          </p>
        </div>
      </div>


      <div className="inference-grid">
        {/* Left: Interactive Scoring Weights & XAI Trace */}
        <div className="inference-left-col">
          <div className="panel weights-tuner-panel">
            <div className="panel-header">
              <h4>⚙️ Multi-Criteria Utility Weight Tuner (Live XAI)</h4>
              <span className="badge badge-active">Active Decision Policy</span>
            </div>
            <p className="muted">
              Adjust weights below during your live demo to dynamically change candidate ranking preferences:
            </p>

            <div className="weight-sliders-grid">
              <div className="weight-row">
                <div className="w-lbl-row">
                  <span>Vision Confidence Weight (w1)</span>
                  <span className="w-val mono">{((weights.w_vision || 0.25) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights.w_vision || 0.25}
                  onChange={(e) => handleSliderChange('w_vision', e.target.value)}
                />
              </div>

              <div className="weight-row">
                <div className="w-lbl-row">
                  <span>Mask IoU Quality Weight (w2)</span>
                  <span className="w-val mono">{((weights.w_mask || 0.25) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights.w_mask || 0.25}
                  onChange={(e) => handleSliderChange('w_mask', e.target.value)}
                />
              </div>

              <div className="weight-row">
                <div className="w-lbl-row">
                  <span>Gripper Jaw Fit Weight (w3)</span>
                  <span className="w-val mono">{((weights.w_jaw || 0.2) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights.w_jaw || 0.2}
                  onChange={(e) => handleSliderChange('w_jaw', e.target.value)}
                />
              </div>

              <div className="weight-row">
                <div className="w-lbl-row">
                  <span>Workspace Centering Weight (w4)</span>
                  <span className="w-val mono">{((weights.w_center || 0.15) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights.w_center || 0.15}
                  onChange={(e) => handleSliderChange('w_center', e.target.value)}
                />
              </div>

              <div className="weight-row">
                <div className="w-lbl-row">
                  <span>Orientation Stability Weight (w5)</span>
                  <span className="w-val mono">{((weights.w_orient || 0.15) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights.w_orient || 0.15}
                  onChange={(e) => handleSliderChange('w_orient', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Reasoning Trace Section */}
          <div className="panel xai-trace-panel">
            <h4>📜 Algorithmic Decision Reasoning Trace (Viva Ready)</h4>
            <div className="terminal-feed">
              {reasoning_trace && reasoning_trace.length > 0 ? (
                reasoning_trace.map((step, idx) => (
                  <div key={`trace-${idx}`} className="trace-line">
                    <span className="trace-prompt">&gt;</span> {step}
                  </div>
                ))
              ) : (
                <div className="trace-line muted">
                  &gt; Execute Vision Pipeline to stream algorithmic reasoning trace...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Candidate Matrix Table & Decision Output */}
        <div className="inference-right-col">
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
              <span>NO CANDIDATE TARGET EVALUATED YET</span>
            </div>
          )}

          {ai_summary && (
            <div className="ai-summary-box">
              <strong>XAI Decision Synthesis:</strong> {ai_summary}
            </div>
          )}

          <div className="panel candidate-matrix-panel">
            <h4>Candidate Evaluation Comparison Matrix</h4>
            <div className="rankings-list">
              {rankings && rankings.length > 0 ? (
                rankings.map((c) => (
                  <div
                    key={`cand-card-${c.index}`}
                    className={`candidate-card ${c.selected ? 'card-selected' : ''}`}
                  >
                    <div className="card-top">
                      <span className="cand-name">
                        {c.selected ? '🏆 ' : ''}#{c.index + 1} {c.label}
                      </span>
                      <span className="cand-score">{c.total_score}% Score</span>
                    </div>

                    <div className="progress-bar-wrap">
                      <div className="progress-bar" style={{ width: `${c.total_score}%` }} />
                    </div>

                    <div className="metrics-grid">
                      <div className="metric">
                        <span className="m-lbl">Vision:</span>
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
                          X:{result.detections[c.index].pose_6d.x_m}m Y:
                          {result.detections[c.index].pose_6d.y_m}m Z:
                          {result.detections[c.index].pose_6d.z_m}m
                        </span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="muted p-12">No objects currently evaluated.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
