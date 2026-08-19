import { useState } from 'react'
import { Camera, Settings, Eye, Sliders, CheckCircle2 } from 'lucide-react'

export function CalibrationPanel() {
  const [params, setParams] = useState({
    fx: 640.0,
    fy: 640.0,
    cx: 320.0,
    cy: 240.0,
    k1: 0.0,
    k2: 0.0,
  })

  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="studio-panel-view">
      <div className="panel-top-header">
        <div className="title-block">
          <h2>⚙️ Pinhole Camera Matrix & PnP Geometry Studio</h2>
          <p className="subtitle">
            Configure the intrinsic camera matrix K (3x3) and radial distortion parameters for metric SE(3) coordinate back-projection.
          </p>

        </div>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          <Settings size={14} />
          <span>{saved ? '✓ Calibration Matrix Saved!' : 'Save Intrinsic Matrix'}</span>
        </button>
      </div>

      <div className="two-col-grid">
        {/* Left: Intrinsic Matrix K Display */}
        <div className="card">
          <div className="card-header">
            <span className="live-tag">📐 INTRINSIC CAMERA MATRIX K</span>
          </div>

          <div className="matrix-display-box mono">
            <div className="matrix-row">
              <span>[ {params.fx.toFixed(1)}</span>
              <span>0.0</span>
              <span>{params.cx.toFixed(1)} ]</span>
            </div>
            <div className="matrix-row">
              <span>[ 0.0</span>
              <span>{params.fy.toFixed(1)}</span>
              <span>{params.cy.toFixed(1)} ]</span>
            </div>
            <div className="matrix-row">
              <span>[ 0.0</span>
              <span>0.0</span>
              <span>1.0 ]</span>
            </div>
          </div>

          <div className="formula-card">
            <h4>Back-Projection Ray Equation:</h4>
            <p className="mono text-cyan">
              X = (u - c_x) * Z / f_x
              <br />
              Y = (v - c_y) * Z / f_y
            </p>
            <p className="muted text-sub">
              Maps normalized 2D image coordinates $(u, v)$ directly into 3D Cartesian coordinates $(X, Y, Z)$ in meters.
            </p>
          </div>
        </div>

        {/* Right: Parameter Sliders */}
        <div className="card">
          <div className="card-header">
            <span className="live-tag">🎛️ INTRINSIC FOCAL & OPTICAL CONTROLS</span>
          </div>

          <div className="weights-sliders-list">
            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Horizontal Focal Length (f_x)</span>
                <span className="w-val mono">{params.fx} px</span>
              </div>
              <input
                type="range"
                min="300"
                max="1200"
                step="10"
                value={params.fx}
                onChange={(e) => setParams({ ...params, fx: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Vertical Focal Length (f_y)</span>
                <span className="w-val mono">{params.fy} px</span>
              </div>
              <input
                type="range"
                min="300"
                max="1200"
                step="10"
                value={params.fy}
                onChange={(e) => setParams({ ...params, fy: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Principal Optical Center X (c_x)</span>
                <span className="w-val mono">{params.cx} px</span>
              </div>
              <input
                type="range"
                min="100"
                max="640"
                step="5"
                value={params.cx}
                onChange={(e) => setParams({ ...params, cx: parseFloat(e.target.value) })}
              />
            </div>

            <div className="weight-row">
              <div className="w-header">
                <span className="w-name">Principal Optical Center Y (c_y)</span>
                <span className="w-val mono">{params.cy} px</span>
              </div>
              <input
                type="range"
                min="100"
                max="480"
                step="5"
                value={params.cy}
                onChange={(e) => setParams({ ...params, cy: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
