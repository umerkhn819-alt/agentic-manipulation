import { useEffect, useRef, useState } from 'react'
import { CameraControls } from './CameraControls'
import { CameraView } from './CameraView'
import { GripperSimulator } from './GripperSimulator'
import { PresetSelector } from './PresetSelector'
import { colorForLabel } from '../lib/draw'

export function VisionStudio({
  videoRef,
  canvasRef,
  dimensions,
  cameraStatus,
  cameraError,
  mirrored,
  setMirrored,
  start,
  stop,
  inputMode,
  setInputMode,
  uploadedImage,
  setUploadedImage,
  presets,
  selectedPreset,
  setSelectedPreset,
  prompt,
  setPrompt,
  zeroShot,
  setZeroShot,
  busy,
  result,
  pipelineStage,
  layerToggles,
  setLayerToggles,
  onSelectTarget,
}) {
  const fileInputRef = useRef(null)
  const [imageDims, setImageDims] = useState({ width: 640, height: 480 })

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setUploadedImage(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  // Update canvas backing store when image natural resolution is detected
  const handleImageLoad = (e) => {
    const nw = e.target.naturalWidth || 640
    const nh = e.target.naturalHeight || 480
    setImageDims({ width: nw, height: nh })
    if (canvasRef.current) {
      canvasRef.current.width = nw
      canvasRef.current.height = nh
    }
  }

  // Synchronize canvas backing dimensions with active mode
  useEffect(() => {
    if (!canvasRef.current) return
    if (inputMode === 'camera' && dimensions.width && dimensions.height) {
      canvasRef.current.width = dimensions.width
      canvasRef.current.height = dimensions.height
    } else if (inputMode !== 'camera' && imageDims.width && imageDims.height) {
      canvasRef.current.width = imageDims.width
      canvasRef.current.height = imageDims.height
    }
  }, [inputMode, dimensions, imageDims, canvasRef])

  const currentDims = inputMode === 'camera' ? dimensions : imageDims

  return (
    <div className="studio-view vision-studio">
      <div className="studio-header">
        <div>
          <div className="studio-title-row">
            <h2>📷 Vision & Visual Servoing Studio</h2>
            <div className="academic-badges-row">
              <span className="badge-citation" title="Carion et al., ECCV 2020">📜 DETR (ECCV'20)</span>
              <span className="badge-citation" title="Cheng et al., CVPR 2022">📜 Mask2Former (CVPR'22)</span>
              <span className="badge-citation" title="Morrison et al., RSS 2018">📜 GG-CNN Grasp (RSS'18)</span>
              <span className="badge-citation" title="Hartley & Zisserman, 2004">📐 Pinhole PnP (6D Pose)</span>
            </div>
          </div>
          <p className="studio-subtitle">
            Transformer-based visual perception: DETR bipartite matching, Mask2Former panoptic segmentation, and 2D/3D antipodal grasp synthesis.
          </p>
        </div>


        {/* 3-Mode Input Source Selector */}
        <div className="input-mode-tabs">
          <button
            type="button"
            className={`btn-tab ${inputMode === 'camera' ? 'tab-active' : ''}`}
            onClick={() => {
              setInputMode('camera')
              if (cameraStatus !== 'live') start()
            }}
          >
            🎥 Live Webcam
          </button>
          <button
            type="button"
            className={`btn-tab ${inputMode === 'upload' ? 'tab-active' : ''}`}
            onClick={() => {
              setInputMode('upload')
              stop()
            }}
          >
            📁 Upload Image
          </button>
          <button
            type="button"
            className={`btn-tab ${inputMode === 'preset' ? 'tab-active' : ''}`}
            onClick={() => {
              setInputMode('preset')
              stop()
            }}
          >
            🖼️ Benchmark Presets
          </button>
        </div>
      </div>

      {/* Google Colab Cloud GPU Endpoint Bar */}
      <div className="colab-gpu-bar">
        <div className="colab-bar-left">
          <span className="colab-badge">⚡ FOUNDATIONPOSE CLOUD GPU</span>
          <input
            type="text"
            className="colab-input"
            placeholder="Paste Google Colab ngrok URL (e.g. https://xxxx.ngrok-free.app) or leave blank for default"
            defaultValue=""
            id="colab-url-input"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const val = document.getElementById('colab-url-input')?.value || ''
              try {
                const res = await fetch('/api/config/colab-url', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ colab_url: val }),
                })
                const data = await res.json()
                alert(data?.message || 'Configured Colab Cloud GPU Endpoint!')
              } catch (e) {
                alert('Error setting Colab URL: ' + e.message)
              }
            }}
          >
            Connect Cloud GPU
          </button>
        </div>
        <div className="colab-bar-right">
          <span className="colab-hint">
            Run <code>cloud_colab_foundationpose_server.ipynb</code> on Colab T4 GPU
          </span>
        </div>
      </div>

      {/* Layer Overlay Toggles Toolbar */}
      <div className="layer-toggles-bar">
        <span className="toggles-lbl">OVERLAYS:</span>
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={layerToggles.boxes}
            onChange={(e) =>
              setLayerToggles({ ...layerToggles, boxes: e.target.checked })
            }
          />
          <span>2D Bounding Boxes</span>
        </label>
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={layerToggles.masks}
            onChange={(e) =>
              setLayerToggles({ ...layerToggles, masks: e.target.checked })
            }
          />
          <span>Segmentation Masks</span>
        </label>
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={layerToggles.grasps}
            onChange={(e) =>
              setLayerToggles({ ...layerToggles, grasps: e.target.checked })
            }
          />
          <span>2D Grasp Rays</span>
        </label>
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={layerToggles.poses}
            onChange={(e) =>
              setLayerToggles({ ...layerToggles, poses: e.target.checked })
            }
          />
          <span>3D Coordinate Axes & 3D Tracking</span>
        </label>
      </div>


      <div className="vision-grid">
        {/* Main Viewport Stage */}
        <div className="vision-main-panel">
          <div className="viewport-stage-container">
            {inputMode === 'camera' && (
              <div className="camera-stage-wrapper">
                <CameraView
                  videoRef={videoRef}
                  canvasRef={canvasRef}
                  dimensions={dimensions}
                  status={cameraStatus}
                  mirrored={mirrored}
                >
                  {busy && (
                    <div className="spinner-wrap">
                      <div className="spinner" />
                      <span>Executing Vision Pipeline...</span>
                    </div>
                  )}
                  <GripperSimulator
                    result={result}
                    dimensions={dimensions}
                    active={pipelineStage === 'simulation' || pipelineStage === 'complete'}
                  />
                </CameraView>
              </div>
            )}

            {inputMode === 'upload' && (
              <div className="upload-stage-wrapper">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                {uploadedImage ? (
                  <div
                    className="media-stage-box"
                    onClick={() => fileInputRef.current?.click()}
                    title="Click image to upload a different photo"
                  >
                    <img
                      src={uploadedImage}
                      alt="Uploaded Frame"
                      className="stage-media-element"
                      onLoad={handleImageLoad}
                    />
                    <canvas ref={canvasRef} className="overlay-canvas-exact" />
                    <GripperSimulator
                      result={result}
                      dimensions={currentDims}
                      active={pipelineStage === 'simulation' || pipelineStage === 'complete'}
                    />
                    <div className="change-photo-badge">📷 Click to Change Photo</div>
                  </div>
                ) : (
                  <div
                    className="upload-dropzone-box"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="dropzone-prompt">
                      <div className="dropzone-icon">📁</div>
                      <div className="dropzone-text">
                        <strong>Click to Upload Image from Disk</strong>
                      </div>
                      <div className="dropzone-sub">
                        Supports any JPG, PNG, WEBP photo (Uncropped & 100% Scaled)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {inputMode === 'preset' && (
              <div className="preset-stage-wrapper">
                {selectedPreset && (
                  <div className="media-stage-box">
                    <img
                      src={selectedPreset.image}
                      alt="Preset Feed"
                      className="stage-media-element"
                      onLoad={handleImageLoad}
                    />
                    <canvas ref={canvasRef} className="overlay-canvas-exact" />
                    <GripperSimulator
                      result={result}
                      dimensions={currentDims}
                      active={pipelineStage === 'simulation' || pipelineStage === 'complete'}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Under-view controls */}
          {inputMode === 'camera' && (
            <CameraControls
              cameraStatus={cameraStatus}
              onStart={start}
              onStop={stop}
              mirrored={mirrored}
              onMirrorChange={setMirrored}
            />
          )}

          {inputMode === 'preset' && (
            <PresetSelector
              presets={presets}
              selectedPreset={selectedPreset}
              onSelectPreset={(p) => {
                setSelectedPreset(p)
              }}
            />
          )}
        </div>

        {/* Right Controls & Detections List */}
        <div className="vision-side-panel">
          <div className="panel">
            <h4>Vision Filter & Settings</h4>
            <div className="field">
              <label>Target Class Filter (Optional)</label>
              <input
                type="text"
                className="prompt-input"
                value={prompt}
                placeholder="e.g. cup, bottle, scissors, person..."
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <label className="checkbox-lbl">
              <input
                type="checkbox"
                checked={zeroShot}
                onChange={(e) => setZeroShot(e.target.checked)}
              />
              Zero-Shot VLM (Qwen3-VL 30B)
            </label>
          </div>

          {result?.ok && result.detections?.length > 0 && (
            <div className="panel detections-table-panel">
              <h4>Detected Workspace Objects ({result.detections.length})</h4>
              <table className="results">
                <thead>
                  <tr>
                    <th>Object</th>
                    <th>Score</th>
                    <th>Mask</th>
                    <th>6D Pose (Cam)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.detections.map((detection, index) => {
                    const isSelected = result?.inference?.selected_index === index
                    return (
                      <tr
                        key={`${detection.label}-${index}`}
                        className={`selectable-row ${isSelected ? 'row-selected' : ''}`}
                        onClick={() => onSelectTarget && onSelectTarget(index)}
                        title="Click to select this object as grasp target"
                      >
                        <td>
                          <span
                            className="swatch"
                            style={{ background: colorForLabel(detection.label) }}
                          />
                          {isSelected ? '🎯 ' : ''}
                          <strong>{detection.label}</strong>
                        </td>
                        <td>
                          {detection.score == null ? (
                            <span className="muted">zero-shot</span>
                          ) : (
                            `${(detection.score * 100).toFixed(1)}%`
                          )}
                        </td>
                        <td>
                          {detection.mask ? (
                            <span className="badge-mask">
                              IoU {detection.mask_iou?.toFixed(2)}
                            </span>
                          ) : (
                            <span className="muted">None</span>
                          )}
                        </td>
                        <td className="mono">
                          {detection.pose_6d ? (
                            <span>
                              Z:{detection.pose_6d.z_m}m ({detection.pose_6d.yaw_deg}°)
                            </span>
                          ) : (
                            <span className="muted">N/A</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="table-hint">💡 Tip: Click any row above to command the gripper to that object.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
