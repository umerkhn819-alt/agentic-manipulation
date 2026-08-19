/**
 * Camera controls and the detection prompt.
 *
 * The prompt behaves differently depending on mode, and the hint text says so explicitly so
 * the behaviour is never surprising:
 *   - DETR mode      : filters the 80 fixed COCO classes
 *   - zero-shot mode : (Phase 3) drives a vision-language model, finds anything you name
 */
export function Controls({
  prompt,
  onPromptChange,
  onCapture,
  onStartCamera,
  onStopCamera,
  cameraStatus,
  busy,
  mirrored,
  onMirrorChange,
}) {
  const cameraLive = cameraStatus === 'live'

  const handleSubmit = (event) => {
    event.preventDefault()
    if (cameraLive && !busy) onCapture()
  }

  return (
    <form className="controls" onSubmit={handleSubmit}>
      <div className="control-row">
        {!cameraLive ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStartCamera}
            disabled={cameraStatus === 'starting'}
          >
            {cameraStatus === 'starting' ? 'Starting…' : 'Start Camera'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={onStopCamera}>
            Stop Camera
          </button>
        )}

        <label className="checkbox" title="Flips the view like a mirror. Does not affect detection.">
          <input
            type="checkbox"
            checked={mirrored}
            onChange={(event) => onMirrorChange(event.target.checked)}
          />
          <span>Mirror view</span>
        </label>
      </div>

      <div className="control-row">
        <div className="field">
          <label htmlFor="prompt">Look for</label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            placeholder="cup . bottle . laptop    (leave empty to show everything)"
            onChange={(event) => onPromptChange(event.target.value)}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={!cameraLive || busy}>
          {busy ? 'Detecting…' : 'Capture & Detect'}
        </button>
      </div>

      <p className="hint">
        Detection uses <code>facebook/detr-resnet-50</code>, which knows 80 fixed COCO
        classes — your text <strong>filters</strong> those. Try <code>cup</code>,{' '}
        <code>bottle</code>, <code>person</code>, <code>laptop</code>, <code>cell phone</code>,{' '}
        <code>scissors</code>, <code>banana</code>. Leave it empty to see everything found.
      </p>
    </form>
  )
}
