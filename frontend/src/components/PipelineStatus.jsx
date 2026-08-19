import React from 'react'

/**
 * Visual pipeline status indicator.
 * Displays state for: CAMERA -> DETECTION -> SEGMENTATION -> INFERENCE -> SIMULATION
 */
export function PipelineStatus({ stage, error }) {
  const STAGES = [
    { id: 'camera', label: '1. CAMERA INPUT' },
    { id: 'detection', label: '2. OBJECT DETECT' },
    { id: 'segmentation', label: '3. MASK SEGMENT' },
    { id: 'inference', label: '4. DECISION ENGINE' },
    { id: 'simulation', label: '5. ROBOT EXECUTION' },
  ]

  const getStatusClass = (stepId) => {
    if (error && stage === stepId) return 'stage-error'
    const order = ['idle', 'camera', 'detection', 'segmentation', 'inference', 'simulation', 'complete']
    const currentIndex = order.indexOf(stage)
    const stepIndex = order.indexOf(stepId)

    if (stage === 'complete' || currentIndex > stepIndex) return 'stage-complete'
    if (stage === stepId) return 'stage-active'
    return 'stage-pending'
  }

  return (
    <div className="pipeline-status-container">
      <div className="pipeline-title">
        <span>PIPELINE EXECUTION STATE</span>
        {stage && <span className={`status-badge badge-${stage}`}>{stage.toUpperCase()}</span>}
      </div>

      <div className="pipeline-steps">
        {STAGES.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className={`pipeline-step ${getStatusClass(step.id)}`}>
              <div className="step-dot" />
              <span className="step-label">{step.label}</span>
            </div>
            {idx < STAGES.length - 1 && <div className={`step-connector ${getStatusClass(step.id)}`} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
