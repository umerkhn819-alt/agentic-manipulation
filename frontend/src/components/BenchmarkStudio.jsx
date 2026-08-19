import { useState } from 'react'
import { runBatchBenchmarks } from '../lib/api'

export function BenchmarkStudio() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState(null)

  const handleRunEvaluation = async () => {
    setRunning(true)
    const res = await runBatchBenchmarks()
    if (res?.ok) {
      setReport(res)
    }
    setRunning(false)
  }

  return (
    <div className="studio-view benchmark-studio">
      <div className="studio-header">
        <div>
          <div className="studio-title-row">
            <h2>📊 Dataset Benchmark Suite & System Evaluation</h2>
            <div className="academic-badges-row">
              <span className="badge-citation" title="Lenz et al., IJRR 2015">📜 Cornell Grasp Protocol (IJRR'15)</span>
              <span className="badge-citation" title="Kirillov et al., CVPR 2019">📜 COCO Panoptic Metric (CVPR'19)</span>
              <span className="badge-citation" title="Depierre et al., IROS 2018">📜 Jacquard Benchmark (IROS'18)</span>
            </div>
          </div>
          <p className="studio-subtitle">
            Standardized academic evaluation measuring object localization mAP, Panoptic Quality (PQ / Mean IoU), and antipodal grasp viability rate metrics.
          </p>
        </div>


        <button
          type="button"
          className="btn btn-primary"
          disabled={running}
          onClick={handleRunEvaluation}
        >
          {running ? '⏳ Running Batch Benchmark...' : '▶ Run Batch Dataset Evaluation'}
        </button>
      </div>

      {report?.summary && (
        <div className="summary-cards-grid">
          <div className="sum-card">
            <span className="sum-lbl">Scenes Evaluated</span>
            <span className="sum-val">{report.summary.total_scenes_evaluated} Tabletop Scenes</span>
          </div>
          <div className="sum-card">
            <span className="sum-lbl">Mean Mask IoU</span>
            <span className="sum-val-green">{report.summary.mean_segmentation_iou_pct}%</span>
          </div>
          <div className="sum-card">
            <span className="sum-lbl">Grasp Viability Rate</span>
            <span className="sum-val-blue">{report.summary.grasp_viability_rate_pct}%</span>
          </div>
          <div className="sum-card">
            <span className="sum-lbl">Mean Latency</span>
            <span className="sum-val">{report.summary.mean_pipeline_latency_ms} ms</span>
          </div>
          <div className="sum-card card-grade">
            <span className="sum-lbl">Evaluation Grade</span>
            <span className="sum-val-grade">{report.summary.overall_system_status}</span>
          </div>
        </div>
      )}

      <div className="panel benchmark-table-panel">
        <h4>Benchmark Dataset Evaluation Logs</h4>
        {report?.scenes ? (
          <table className="results">
            <thead>
              <tr>
                <th>Scene Benchmark</th>
                <th>Objects Found</th>
                <th>Selected Target</th>
                <th>Inference Score</th>
                <th>Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.scenes.map((s, idx) => (
                <tr key={`scene-${idx}`}>
                  <td><strong>{s.scene_title}</strong></td>
                  <td>{s.objects_found} objects</td>
                  <td className="mono">{s.selected_target}</td>
                  <td><span className="badge-mask">{s.target_score}%</span></td>
                  <td className="mono">{s.latency_ms} ms</td>
                  <td><span className="badge badge-complete">{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-benchmark-prompt">
            <p className="muted">
              Click <strong>"▶ Run Batch Dataset Evaluation"</strong> above to benchmark the entire vision & manipulation pipeline across test images.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
