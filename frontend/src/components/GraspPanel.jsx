/**
 * The Grasp tab: where a two-fingered gripper should close on each object.
 *
 * Every number here comes from the real segmentation mask — centre of mass, principal axis,
 * and the two points where the jaws would actually touch. Nothing is estimated from the
 * bounding box.
 */
export function GraspPanel({ prompt, onPromptChange, onCapture, cameraLive, busy, result }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    if (cameraLive && !busy) onCapture()
  }

  const detections = result?.ok ? result.detections || [] : []
  const grasps = detections.filter((d) => d.grasp)
  const frameWidth = result?.processed_width || 0

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="control-row">
        <div className="field">
          <label htmlFor="grasp-prompt">Object to grasp</label>
          <input
            id="grasp-prompt"
            type="text"
            value={prompt}
            placeholder="cup"
            onChange={(event) => onPromptChange(event.target.value)}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={!cameraLive || busy}>
          {busy ? 'Computing…' : 'Capture & Plan Grasp'}
        </button>
      </div>

      {detections.length > 0 && (
        <div className="mask-summary">
          <strong>{grasps.length}</strong> of <strong>{detections.length}</strong> objects have a
          grasp plan
          {grasps.length < detections.length && (
            <span className="muted">
              {' '}
              — the rest had no mask, and a grasp is never guessed from the box alone
            </span>
          )}
        </div>
      )}

      {grasps.length > 0 && (
        <table className="results grasp-table">
          <thead>
            <tr>
              <th>Object</th>
              <th>Grasp point</th>
              <th>Jaw angle</th>
              <th>Jaw width</th>
            </tr>
          </thead>
          <tbody>
            {grasps.map((detection, index) => (
              <tr key={`${detection.label}-${index}`}>
                <td>{detection.label}</td>
                <td className="mono">
                  {detection.grasp.x.toFixed(3)}, {detection.grasp.y.toFixed(3)}
                </td>
                <td className="mono">{detection.grasp.angle_deg.toFixed(1)}°</td>
                <td className="mono">
                  {detection.grasp.width_norm.toFixed(3)}
                  {frameWidth > 0 && (
                    <span className="muted">
                      {' '}
                      ({(detection.grasp.width_norm * frameWidth).toFixed(0)}px)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint">
        The crosshair marks the mask’s <strong>centre of mass</strong>, and the white line is
        the direction the jaws close — always <strong>across</strong> the object’s narrow
        dimension, since squeezing along its length would slide off. The end brackets are
        where the fingers would actually touch. Full coordinates are logged to the browser
        console (F12) in a robot-controller-ready format.
      </p>

      <p className="hint warn-note">
        <strong>No depth data.</strong> Hugging Face serves no depth-estimation model on any
        provider, so <code>depth_m</code> is logged as <code>null</code> rather than a
        fabricated number. These coordinates are 2D image-frame only — a real gripper would
        need a depth sensor or a camera-to-world calibration to use them.
      </p>
    </form>
  )
}
