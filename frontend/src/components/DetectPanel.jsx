/**
 * The Detect tab: prompt, detector mode, and the capture button.
 *
 * The prompt means something DIFFERENT in each mode, so the hint text below changes with
 * the toggle rather than describing both at once:
 *   - DETR      : filters the 80 fixed COCO classes
 *   - zero-shot : drives a vision-language model, which finds anything you can name
 */

// A few COCO classes worth suggesting, chosen for things likely to be on a desk.
const COCO_SUGGESTIONS = ['cup', 'bottle', 'cell phone', 'laptop', 'book', 'scissors', 'person']
const OPEN_SUGGESTIONS = ['screwdriver', 'cup handle', 'red pen', 'coffee mug rim', 'usb cable']

export function DetectPanel({
  prompt,
  onPromptChange,
  zeroShot,
  onZeroShotChange,
  onCapture,
  cameraLive,
  busy,
}) {
  const suggestions = zeroShot ? OPEN_SUGGESTIONS : COCO_SUGGESTIONS

  const handleSubmit = (event) => {
    event.preventDefault()
    if (cameraLive && !busy) onCapture()
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="control-row">
        <div className="field">
          <label htmlFor="prompt">Look for</label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            placeholder={
              zeroShot
                ? 'anything you can name — e.g. screwdriver'
                : 'cup . bottle    (empty = show everything)'
            }
            onChange={(event) => onPromptChange(event.target.value)}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={!cameraLive || busy}>
          {busy ? 'Detecting…' : 'Capture & Detect'}
        </button>
      </div>

      <div className="suggestions">
        <span className="suggestions-label">Try:</span>
        {suggestions.map((word) => (
          <button
            key={word}
            type="button"
            className="chip"
            onClick={() => onPromptChange(word)}
            disabled={busy}
          >
            {word}
          </button>
        ))}
      </div>

      <label className="mode-toggle">
        <input
          type="checkbox"
          checked={zeroShot}
          onChange={(event) => onZeroShotChange(event.target.checked)}
          disabled={busy}
        />
        <span>
          <strong>Zero-shot mode</strong> — find anything you can name
        </span>
      </label>

      {zeroShot ? (
        <p className="hint">
          Uses <code>Qwen3-VL-30B-A3B</code>, a vision-language model. It can find objects{' '}
          <strong>and object parts</strong> outside any fixed class list — try{' '}
          <code>cup handle</code> or <code>screwdriver</code>. It returns{' '}
          <strong>no confidence score</strong>, so boxes are labelled{' '}
          <em>zero-shot</em> rather than given a made-up percentage. Costs more credit per
          frame than the default detector.
        </p>
      ) : (
        <p className="hint">
          Uses <code>facebook/detr-resnet-50</code>, which knows{' '}
          <strong>80 fixed COCO classes</strong> — your text <em>filters</em> those rather
          than driving the model. Leave it empty to see everything found. For anything
          outside those classes, switch on zero-shot mode.
        </p>
      )}
    </form>
  )
}
