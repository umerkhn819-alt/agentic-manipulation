/**
 * The Stream tab: continuous detection with live throughput stats.
 *
 * The skipped counter is the most informative number here — it is the backpressure working,
 * not a fault. See useStream.js for why frames are dropped rather than queued.
 */
export function StreamPanel({
  prompt,
  onPromptChange,
  streaming,
  stats,
  onStart,
  onStop,
  cameraLive,
  withMasks,
  onWithMasksChange,
}) {
  return (
    <div className="panel">
      <div className="control-row">
        <div className="field">
          <label htmlFor="stream-prompt">Look for</label>
          <input
            id="stream-prompt"
            type="text"
            value={prompt}
            placeholder="cup . bottle    (empty = show everything)"
            onChange={(event) => onPromptChange(event.target.value)}
            autoComplete="off"
          />
        </div>

        {!streaming ? (
          <button type="button" className="btn btn-primary" onClick={onStart} disabled={!cameraLive}>
            Start Stream
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={onStop}>
            Stop Stream
          </button>
        )}
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={withMasks}
          onChange={(event) => onWithMasksChange(event.target.checked)}
          disabled={streaming}
        />
        <span>
          Include masks <span className="muted">(slower per frame; set before starting)</span>
        </span>
      </label>

      <div className="stats">
        <Stat label="Sent" value={stats.sent} />
        <Stat label="Received" value={stats.received} />
        <Stat
          label="Skipped"
          value={stats.skipped}
          hint="Ticks where the previous frame had not come back yet. Frames are dropped, never queued."
          muted
        />
        <Stat label="Errors" value={stats.errors} danger={stats.errors > 0} />
        <Stat label="Last" value={stats.lastMs == null ? '—' : `${stats.lastMs}ms`} />
        <Stat label="Average" value={stats.avgMs == null ? '—' : `${stats.avgMs}ms`} />
      </div>

      {streaming && (
        <div className="stream-live">
          <span className="pulse" /> Streaming — a frame is sent only after the previous
          result arrives
        </div>
      )}

      <p className="hint">
        Ticks once per second, but sends a frame <strong>only when the previous response has
        arrived</strong>. Because cloud inference takes a few seconds, most ticks are skipped
        — that is the backpressure working. Queueing them instead would make the boxes drift
        further and further behind what the camera is actually seeing. All timings are real
        measured round trips.
      </p>
    </div>
  )
}

function Stat({ label, value, hint, muted, danger }) {
  return (
    <div className={`stat ${muted ? 'stat-muted' : ''} ${danger ? 'stat-danger' : ''}`} title={hint}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
