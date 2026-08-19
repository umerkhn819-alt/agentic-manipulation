/**
 * The Segment tab: detection plus per-object silhouette masks.
 *
 * Segmentation runs CONCURRENTLY with detection on the backend, so enabling it costs the
 * slower of the two calls rather than their sum.
 */
export function SegmentPanel({ prompt, onPromptChange, onCapture, cameraLive, busy, result }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    if (cameraLive && !busy) onCapture()
  }

  // Report how many detections actually received a mask. Unmatched ones are shown as such
  // rather than quietly hidden.
  const detections = result?.ok ? result.detections || [] : []
  const masked = detections.filter((d) => d.mask).length

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="control-row">
        <div className="field">
          <label htmlFor="seg-prompt">Look for</label>
          <input
            id="seg-prompt"
            type="text"
            value={prompt}
            placeholder="cup . bottle    (empty = show everything)"
            onChange={(event) => onPromptChange(event.target.value)}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={!cameraLive || busy}>
          {busy ? 'Segmenting…' : 'Capture & Segment'}
        </button>
      </div>

      {detections.length > 0 && (
        <div className="mask-summary">
          <strong>{masked}</strong> of <strong>{detections.length}</strong> objects got a mask
          {masked < detections.length && (
            <span className="muted">
              {' '}
              — the rest had no matching silhouette, reported as “no mask” rather than filled
              with a guess
            </span>
          )}
        </div>
      )}

      <p className="hint">
        Masks come from <code>mask2former-swin-tiny-coco-panoptic</code>, which returns one
        silhouette <strong>per object instance</strong> — two cups get two separate masks.
        Each mask is matched to its detection box by pixel overlap and clipped to that box,
        so shapes never bleed between neighbouring objects. Shapes are drawn as translucent
        colour fills at 40% opacity.
      </p>
    </form>
  )
}
