/**
 * Tab bar for switching between features.
 *
 * The camera and canvas live ABOVE the tabs and are shared by all of them — switching tabs
 * swaps only the controls, so the video never restarts and you never have to re-grant
 * camera permission.
 *
 * Tabs for phases that are not built yet are shown disabled rather than hidden, so the
 * roadmap is visible without pretending the feature works.
 */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            title={tab.disabled ? `${tab.label} — not built yet` : tab.hint}
            className={`tab ${isActive ? 'tab-active' : ''}`}
            onClick={() => !tab.disabled && onChange(tab.id)}
          >
            <span className="tab-label">{tab.label}</span>
            {tab.disabled && <span className="tab-badge">soon</span>}
          </button>
        )
      })}
    </div>
  )
}
