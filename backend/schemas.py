"""
Request and response models for the API.

The full response shape is defined here up front (including the mask/grasp fields that
later phases populate) so the contract with the frontend never changes shape — later
phases only start filling in fields that were already declared optional.

COORDINATE CONVENTION (important):
    Every coordinate that leaves this backend is NORMALIZED to 0.0-1.0, relative to the
    frame. The frontend multiplies by canvas width/height and never needs to know what
    resolution we compressed to. This is what keeps three different upstream coordinate
    systems (DETR absolute pixels, Qwen3-VL's 0-1000 scale, and mask PNGs at their own
    resolution) from colliding in the drawing code.
"""

from typing import Literal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------------------
# Request
# --------------------------------------------------------------------------------------


class DetectRequest(BaseModel):
    """A single frame plus what the caller wants done with it."""

    # A data URL ("data:image/jpeg;base64,...") or a bare base64 string. Both are accepted.
    image: str

    # Free-text prompt. In DETR mode it FILTERS the 80 COCO classes; in zero-shot mode it
    # is passed to the vision-language model as the list of things to find.
    prompt: str = "cup"

    # Route to the vision-language model instead of DETR (Phase 3).
    zero_shot: bool = False

    # Also request segmentation masks (Phase 4).
    segment: bool = False

    # Also compute grasp points from the masks (Phase 6). Implies segmentation.
    grasp: bool = False

    # Echoed back on WebSocket responses so the client can match reply to frame (Phase 5).
    frame_id: int | None = None

    # Dynamic weights for Inference Engine scoring
    weights: dict | None = None


class SimStepRequest(BaseModel):
    """Request payload to step PyBullet 3D physics simulator."""

    target_x: float = 0.5
    target_y: float = 0.0
    target_z: float = 0.2
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    joints: list[float] | None = None



# --------------------------------------------------------------------------------------
# Response pieces
# --------------------------------------------------------------------------------------


class Box(BaseModel):
    """Bounding box, normalized 0.0-1.0. (x1,y1) top-left, (x2,y2) bottom-right."""

    x1: float
    y1: float
    x2: float
    y2: float


class Point(BaseModel):
    """A normalized 0.0-1.0 point in the frame."""

    x: float
    y: float


class Grasp(BaseModel):
    """
    A gripper grasp proposal derived from a real segmentation mask (Phase 6).

    Computed from mask geometry — never guessed from the box alone. If no mask matched a
    detection, the detection's `grasp` stays None rather than being invented.
    """

    # Mask centroid (centre of mass), which stays on the object even for handled shapes.
    x: float
    y: float

    # Angle the gripper jaws close along, in degrees. Perpendicular to the object's long
    # axis, which is the direction a real gripper would close.
    angle_deg: float

    # Distance between the two jaw contact points, normalized to frame width.
    width_norm: float

    # The two points on the mask edge where the jaws would actually touch.
    jaws: list[Point]


class Axis3D(BaseModel):
    """3D coordinate axis vector projected to 2D image coordinates."""
    origin: Point
    x_axis: Point
    y_axis: Point
    z_axis: Point


class Pose6D(BaseModel):
    """
    6D Pose estimation in camera coordinate system (X, Y, Z translation in meters, Roll, Pitch, Yaw rotation in degrees).
    Powered by FoundationPose (Wen et al., CVPR 2024 / NVidia) cloud spatial engine.
    """

    x_m: float           # Lateral X position in meters relative to optical axis (-0.5m to +0.5m)
    y_m: float           # Vertical Y position in meters relative to optical axis (-0.5m to +0.5m)
    z_m: float           # Depth distance Z in meters (0.3m to 1.5m)
    roll_deg: float      # Roll angle around X axis (degrees)
    pitch_deg: float     # Pitch angle around Y axis (degrees)
    yaw_deg: float       # Yaw angle around Z axis (degrees)
    bbox_3d: list[Point] = Field(default_factory=list) # Projected 3D box wireframe vertices (8 corners)
    axes_3d: Axis3D | None = None                      # Projected 3D coordinate triad (Red=X, Green=Y, Blue=Z)
    velocity_3d: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0]) # 3D Cartesian velocity (vx, vy, vz) in m/s
    tracking_id: str | None = None                     # Temporal tracking ID across video frames
    trajectory_history: list[Point] = Field(default_factory=list) # Historical 2D/3D path points for visual trails
    model_source: str = "FoundationPose-CVPR24 (Cloud)" # Cloud deep learning model provenance



class Detection(BaseModel):
    """One detected object. Every field here came from a real API response."""

    label: str

    # DETR returns a real confidence. The vision-language model does NOT return one, so in
    # zero-shot mode this is None and the UI shows "(zero-shot)" rather than a made-up
    # percentage.
    score: float | None

    box: Box

    # Base64 PNG data URL of this object's mask (Phase 4). None means no mask matched —
    # an honest "not found", not a placeholder.
    mask: str | None = None

    # The real IoU of the mask-to-box match, so the quality of the match is visible.
    mask_iou: float | None = None

    grasp: Grasp | None = None

    # 6D Spatial Pose (X, Y, Z meters, Roll, Pitch, Yaw degrees)
    pose_6d: Pose6D | None = None



class LatencyBreakdown(BaseModel):
    """Real measured milliseconds per stage. Never estimated."""

    compress: float | None = None
    detect: float | None = None
    segment: float | None = None
    total: float | None = None


class ApiError(BaseModel):
    """
    A real upstream failure, passed through verbatim.

    There is no fallback path in this app: when a call fails the caller gets this, and the
    UI renders `message` as-is. No synthetic boxes, no default masks, no placeholder scores.
    """

    # Which step failed, so the UI can say where things broke.
    stage: Literal["config", "decode", "compress", "detect", "segment", "grasp", "internal"]

    # The real HTTP status from Hugging Face, when the failure was an HTTP response.
    status: int | None = None

    # Which model was being called.
    model: str | None = None

    # The verbatim upstream response body / exception text.
    message: str

    # Set when a partial result is still usable (e.g. detection worked, segmentation
    # failed) — the response then carries BOTH real detections and this real error.
    partial: bool = False


class CandidateScore(BaseModel):
    """Detailed multi-criteria utility score breakdown for a single candidate grasp."""

    index: int
    label: str
    total_score: float         # 0.0 - 100.0%
    vision_score: float        # Raw detection confidence
    mask_score: float          # Mask IoU quality
    jaw_fit_score: float       # Physical gripper opening fit
    centering_score: float     # Workspace centering penalty
    orientation_score: float   # Angle stability score
    collision_risk: bool       # Collision overlap detected with other bounding boxes
    selected: bool             # Is this the chosen target?


class InferenceResult(BaseModel):
    """Output from the Decision & Inference Engine (XAI)."""

    selected_target: str | None = None
    selected_index: int | None = None
    confidence_score: float | None = None  # 0.0 - 100.0%
    candidate_count: int = 0
    rankings: list[CandidateScore] = Field(default_factory=list)
    reasoning_trace: list[str] = Field(default_factory=list)
    ai_summary: str | None = None


# --------------------------------------------------------------------------------------
# Response
# --------------------------------------------------------------------------------------


class DetectResponse(BaseModel):
    """
    The single response shape for both HTTP and WebSocket.

    `ok=False` always means nothing usable came back. `ok=True` with a populated `error`
    means a secondary stage failed but the primary results are real and usable.
    """

    ok: bool

    # Which model actually produced these results ("detr-resnet-50" / "qwen3-vl-8b").
    # Lets the UI prove to you which path served the request.
    source: str | None = None

    detections: list[Detection] = Field(default_factory=list)

    # Output of the Decision & Inference Engine
    inference: InferenceResult | None = None

    # The dimensions we compressed to before upload. The frontend does not need these
    # (coordinates are normalized) but they are useful when debugging.
    processed_width: int | None = None
    processed_height: int | None = None

    latency_ms: LatencyBreakdown = Field(default_factory=LatencyBreakdown)

    error: ApiError | None = None

    # Echoed from the request on the WebSocket path (Phase 5).
    frame_id: int | None = None



class HealthResponse(BaseModel):
    """Reports whether the service is up and whether a token is even configured."""

    status: Literal["ok"]
    token_configured: bool
    token_message: str
    detection_model: str
    segmentation_model: str
    vlm_model: str
