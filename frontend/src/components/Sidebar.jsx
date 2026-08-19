import {
  Activity,
  Award,
  BookOpen,
  Bot,
  Camera,
  Layers,
  Settings,
} from 'lucide-react'

export function Sidebar({ currentStudio, onSelectStudio, pipelineStage, onOpenDocs }) {
  const STUDIOS = [
    { id: 'vision', label: 'Vision & Servoing', icon: Camera, badge: 'Studio 1' },
    { id: 'pybullet', label: '3D Physics Simulator', icon: Bot, badge: 'Studio 2' },
    { id: 'inference', label: 'Inference & XAI', icon: Layers, badge: 'Studio 3' },
    { id: 'calibration', label: 'Camera & Latency', icon: Settings, badge: 'Studio 4' },
    { id: 'benchmark', label: 'Dataset Benchmarks', icon: Award, badge: 'Studio 5' },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">🤖</div>
        <div className="brand-text">
          <div className="brand-title">AUTONOMOUS ROBOTICS</div>
          <div className="brand-subtitle">Visual Servoing & Manipulation Lab</div>
        </div>
      </div>

      <div className="sidebar-section-title">NAVIGATION STUDIOS</div>

      <nav className="sidebar-nav">
        {STUDIOS.map((s) => {
          const Icon = s.icon
          const isActive = currentStudio === s.id
          return (
            <button
              key={s.id}
              type="button"
              className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              onClick={() => onSelectStudio(s.id)}
            >
              <div className="nav-item-left">
                <Icon size={16} className="nav-icon" />
                <span className="nav-label">{s.label}</span>
              </div>
              <span className="nav-badge">{s.badge}</span>
            </button>
          )
        })}
      </nav>

      {/* Research Citations & Documentation Button */}
      <div className="sidebar-research-box">
        <button
          type="button"
          className="btn-research-docs"
          onClick={onOpenDocs}
          title="Open Theoretical Formulations & Peer-Reviewed Literature Citations"
        >
          <BookOpen size={15} />
          <span>Research Citations & BibTeX</span>
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="pipeline-mini-status">
          <div className="mini-status-header">
            <Activity size={12} />
            <span>PIPELINE TELEMETRY</span>
          </div>
          <div className={`mini-status-badge badge-${pipelineStage}`}>
            {pipelineStage.toUpperCase()}
          </div>
        </div>
      </div>
    </aside>
  )
}
