/**
 * Preset Scene Selector for instant offline / no-webcam demonstration.
 */
export function PresetSelector({ presets, selectedPreset, onSelectPreset }) {
  if (!presets || presets.length === 0) return null

  return (
    <div className="preset-selector-container">
      <div className="preset-header">
        <span>📸 DEMO BENCHMARK PRESETS (NO WEBCAM NEEDED)</span>
      </div>

      <div className="preset-grid">
        {presets.map((p) => (
          <div
            key={p.id}
            className={`preset-card ${selectedPreset?.id === p.id ? 'preset-active' : ''}`}
            onClick={() => onSelectPreset(p)}
          >
            <div className="preset-thumb-wrap">
              <img src={p.image} alt={p.title} className="preset-thumb" />
            </div>
            <div className="preset-info">
              <div className="preset-title">{p.title}</div>
              <div className="preset-desc">{p.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
