/**
 * Camera controls that stay visible across all tabs.
 *
 * These sit outside the tab panels because the camera is shared: switching tabs must never
 * restart the video stream or re-trigger the browser permission prompt.
 */
export function CameraControls({ cameraStatus, onStart, onStop, mirrored, onMirrorChange }) {
  const live = cameraStatus === 'live'

  return (
    <div className="camera-controls">
      {!live ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          disabled={cameraStatus === 'starting'}
        >
          {cameraStatus === 'starting' ? 'Starting…' : 'Start Camera'}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={onStop}>
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
  )
}
