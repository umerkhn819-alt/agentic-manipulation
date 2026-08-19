/**
 * Shows what really happened on the last request: which model served it, real measured
 * latency, and — critically — the verbatim error text when something failed.
 *
 * There is no fallback rendering path here. If the backend reported an error, that error is
 * what you see; the app never substitutes a friendly fiction for a real failure.
 */
export function StatusBar({ result, health, cameraError }) {
  // Camera problems are local and take priority — no point talking about the API when
  // there is no video to send.
  if (cameraError) {
    return (
      <div className="status status-error">
        <strong>Camera problem</strong>
        <p>{cameraError}</p>
      </div>
    )
  }

  // Warn about a missing token before the user wastes a capture on it.
  if (health && !health.token_configured) {
    return (
      <div className="status status-warn">
        <strong>No Hugging Face token configured</strong>
        <pre>{health.token_message}</pre>
      </div>
    )
  }

  if (health === null) {
    return (
      <div className="status status-warn">
        <strong>Backend offline</strong>
        <p>
          Could not reach the backend. Start it in another terminal:
          <br />
          <code>cd backend</code> then <code>python run.py</code>
        </p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="status status-idle">
        Ready. Start the camera, then press <strong>Capture &amp; Detect</strong>.
      </div>
    )
  }

  if (!result.ok) {
    const error = result.error || {}
    return (
      <div className="status status-error">
        <strong>
          Detection failed
          {error.stage ? ` during ${error.stage}` : ''}
          {error.status ? ` (HTTP ${error.status})` : ''}
        </strong>
        {error.model && <p className="status-model">model: {error.model}</p>}
        {/* Verbatim upstream text — not paraphrased. */}
        <pre>{error.message}</pre>
      </div>
    )
  }

  const latency = result.latency_ms || {}
  const count = result.detections?.length ?? 0

  return (
    <div className="status status-ok">
      <div className="status-line">
        <span>
          <strong>{count}</strong> object{count === 1 ? '' : 's'} found
        </span>
        <span className="dot">·</span>
        <span>
          served by <code>{result.source}</code>
        </span>
        <span className="dot">·</span>
        <span>
          <strong>{Math.round(latency.total ?? 0)}ms</strong> total
        </span>
        {latency.detect != null && (
          <>
            <span className="dot">·</span>
            <span className="muted">inference {Math.round(latency.detect)}ms</span>
          </>
        )}
        {result.processed_width && (
          <>
            <span className="dot">·</span>
            <span className="muted">
              sent {result.processed_width}×{result.processed_height}
            </span>
          </>
        )}
      </div>

      {count === 0 && (
        <p className="muted">
          The API responded successfully but matched nothing. This is a real empty result,
          not an error — try clearing the prompt to see every class the model found.
        </p>
      )}

      {/* A partial failure: primary results are real, but a secondary stage failed. */}
      {result.error && (
        <pre className="status-partial">
          {result.error.stage}: {result.error.message}
        </pre>
      )}
    </div>
  )
}
