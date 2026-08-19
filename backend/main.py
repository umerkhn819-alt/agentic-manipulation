"""
FastAPI application: the robot vision backend.

Phase 1 scope: /health and /api/detect (object detection via DETR).
Later phases add the zero-shot VLM path, segmentation, the WebSocket stream, and grasp
points — all reusing the response shape already declared in schemas.py.

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import io
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel


import benchmarks
import config
import gemini_client
import hf_client
import inference
import pose_6d_cloud
import presets
import sim_server
import vision
from hf_client import HFError
from schemas import (
    ApiError,
    Box,
    Detection,
    DetectRequest,
    DetectResponse,
    Grasp,
    HealthResponse,
    LatencyBreakdown,
    SimStepRequest,
)

# A single shared AsyncClient — reusing connections matters when streaming frames.
http_client: httpx.AsyncClient | None = None


# --------------------------------------------------------------------------------------
# Startup validation
# --------------------------------------------------------------------------------------


def _make_test_image() -> bytes:
    """
    Build a small throwaway JPEG for the startup token check.

    Generated in memory rather than shipped as a file, so the check has no dependency on
    anything on disk. What it depicts does not matter — we only care whether the API
    accepts our credentials.
    """
    image = Image.new("RGB", (64, 64), (127, 127, 127))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    return buffer.getvalue()


async def _validate_token_on_startup(client: httpx.AsyncClient) -> None:
    """
    Make ONE real API call at boot and print exactly what came back.

    This deliberately warns instead of exiting: the frontend phases still need the server
    running even before a token exists. The point is that the true state is stated at
    startup rather than discovered later through a confusing failure.
    """
    print("\n" + "=" * 74)
    print("  Robot Vision Backend — startup check")
    print("=" * 74)

    configured, message = config.token_status()
    if not configured:
        print(f"\n[!] {message}\n")
        print("  The server will still start so you can work on the frontend, but")
        print("  /api/detect will return a real 'config' error until a token is set.")
        print("=" * 74 + "\n")
        return

    print(f"\n  {message}")
    print(f"  Testing a real call to {config.DETECTION_MODEL} ...")

    try:
        started = time.perf_counter()
        result = await hf_client.health_check(client, _make_test_image())
        elapsed_ms = (time.perf_counter() - started) * 1000
        print(
            f"  [OK] HTTP 200 in {elapsed_ms:.0f}ms — "
            f"{len(result)} detection(s) on the blank test image."
        )
        print("       Token works. Real inference is available.")
    except HFError as exc:
        status = f"HTTP {exc.status}" if exc.status else "no response"
        print(f"  [FAIL] {status}: {exc.message}")
        hint = exc.hint()
        if hint:
            print(f"         {hint}")
        print("\n  The server will still start, but detections will fail until this is fixed.")
    except Exception as exc:  # noqa: BLE001 - startup must never crash the process
        print(f"  [FAIL] Unexpected error during startup check: {exc!r}")

    print("=" * 74 + "\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the shared HTTP client, validate the token, and clean up on shutdown."""
    global http_client
    http_client = httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT_S)

    await _validate_token_on_startup(http_client)

    yield

    await http_client.aclose()
    http_client = None


app = FastAPI(
    title="Robot Vision API",
    description="Cloud-only object detection and grasp estimation for a robot gripper.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------------------
# Core pipeline
# --------------------------------------------------------------------------------------


async def _cancel_task(task: asyncio.Task | None) -> None:
    """
    Cancel a concurrent task we no longer need and absorb its outcome.

    Without this, a segmentation call still in flight when detection fails would raise
    "Task exception was never retrieved" noise into the logs.
    """
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: B014 - outcome is deliberately ignored
        pass


async def run_detection(request: DetectRequest) -> DetectResponse:
    """
    Run one frame through the pipeline and return real results or a real error.

    Every failure path here produces an ApiError carrying the actual upstream message.
    There is no branch anywhere in this function that invents a detection.
    """
    total_started = time.perf_counter()
    latency = LatencyBreakdown()

    # --- Stage 1: decode + compress (local, no network) ---
    try:
        compress_started = time.perf_counter()
        jpeg_bytes, width, height = vision.prepare_frame(request.image)
        latency.compress = round((time.perf_counter() - compress_started) * 1000, 1)
    except vision.ImageError as exc:
        return DetectResponse(
            ok=False,
            frame_id=request.frame_id,
            error=ApiError(stage="decode", message=str(exc)),
            latency_ms=latency,
        )

    # --- Stage 2: detection (network) ---
    if http_client is None:
        return DetectResponse(
            ok=False,
            frame_id=request.frame_id,
            error=ApiError(stage="internal", message="HTTP client is not initialized."),
            latency_ms=latency,
        )

    # Two very different detectors behind one flag:
    #   zero_shot=False -> DETR, fast, 80 fixed COCO classes, real confidence scores
    #   zero_shot=True  -> a vision-language model, finds anything nameable, no scores
    model_used = config.VLM_MODEL if request.zero_shot else config.DETECTION_MODEL

    # Grasp points are computed from mask geometry, so asking for grasp implies segmentation.
    want_segments = request.segment or request.grasp

    # Start segmentation NOW, concurrently with detection, rather than after it. The two
    # calls are independent, so running them in parallel costs the slower of the two instead
    # of their sum — roughly halving latency when both are requested.
    segment_task = None
    segment_started = 0.0
    if want_segments:
        # Timed from creation, not from the await — by the time detection finishes this
        # call has usually already completed, and measuring the await would report ~0ms
        # and hide how long segmentation actually took.
        segment_started = time.perf_counter()
        segment_task = asyncio.create_task(
            hf_client.post_image(
                http_client,
                config.SEGMENTATION_MODEL,
                jpeg_bytes,
                stage="segment",
            )
        )

    try:
        detect_started = time.perf_counter()

        if request.zero_shot:
            raw_text = await hf_client.chat_vlm(
                http_client,
                jpeg_bytes,
                vision.parse_prompt_terms(request.prompt),
            )
            # A parse failure here is reported as a real error, never as "found nothing".
            parsed = vision.parse_vlm_detections(raw_text)
            detections = [
                Detection(
                    label=item["label"],
                    # The model returns no confidence value. Emitting None (rather than a
                    # plausible-looking number) is what keeps the UI honest.
                    score=None,
                    box=Box(**item["box"]),
                )
                for item in parsed
            ]
        else:
            raw_detections = await hf_client.post_image(
                http_client,
                config.DETECTION_MODEL,
                jpeg_bytes,
                stage="detect",
            )

            # DETR reports every class it finds, so filter by confidence then by prompt.
            above_threshold = [
                detection
                for detection in raw_detections
                if float(detection.get("score", 0.0)) >= config.DETECTION_THRESHOLD
            ]
            matched = vision.filter_detections_by_prompt(above_threshold, request.prompt)

            detections = []
            for item in matched:
                normalized = vision.normalize_detr_box(item.get("box", {}), width, height)
                if normalized is None:
                    continue  # Degenerate box — skip rather than emit something undrawable.
                detections.append(
                    Detection(
                        label=str(item.get("label", "unknown")),
                        score=float(item.get("score", 0.0)),
                        box=Box(**normalized),
                    )
                )

        latency.detect = round((time.perf_counter() - detect_started) * 1000, 1)

    except vision.VLMParseError as exc:
        # The model answered but we could not read it. Include its raw words so the failure
        # is diagnosable rather than mysterious.
        await _cancel_task(segment_task)
        return DetectResponse(
            ok=False,
            frame_id=request.frame_id,
            processed_width=width,
            processed_height=height,
            error=ApiError(
                stage="detect",
                model=config.VLM_MODEL,
                message=(
                    f"{exc.message}\n\nThe model actually replied:\n"
                    f"{exc.raw_text[:600]}"
                ),
            ),
            latency_ms=latency,
        )
    except HFError as exc:
        # The real status and body go straight to the UI.
        await _cancel_task(segment_task)
        hint = exc.hint()
        message = f"{exc.message}\n\n{hint}" if hint else exc.message
        return DetectResponse(
            ok=False,
            frame_id=request.frame_id,
            processed_width=width,
            processed_height=height,
            error=ApiError(
                stage="detect",
                status=exc.status,
                model=exc.model or model_used,
                message=message,
            ),
            latency_ms=latency,
        )

    # Strongest first, so the most confident labels draw on top. Zero-shot results have no
    # score, so they keep the model's own ordering.
    detections.sort(key=lambda d: d.score if d.score is not None else 0.0, reverse=True)

    # --- Stage 3: attach segmentation masks (already running concurrently) ---
    #
    # A segmentation failure is NOT fatal: detections are real and useful on their own, so
    # we return them together with the real segmentation error rather than discarding
    # everything. That is what `partial` on the error means.
    segment_error: ApiError | None = None

    if segment_task is not None:
        try:
            segments = await segment_task
            # Real wall-clock for the segmentation call itself, measured from when it was
            # launched. Compare against latency.total to see the concurrency win.
            latency.segment = round((time.perf_counter() - segment_started) * 1000, 1)

            # Pair each box with the mask that best covers it. Unmatched detections keep
            # mask=None — an honest "no mask found", never a substitute shape.
            detection_dicts = [
                {"label": d.label, "box": d.box.model_dump()} for d in detections
            ]
            matches = vision.match_masks_to_boxes(segments, detection_dicts, width, height)

            for index, detection in enumerate(detections):
                match = matches.get(index)
                if match is None:
                    continue
                mask_array, iou = match
                detection.mask = vision.encode_mask_png(mask_array)
                detection.mask_iou = iou

                if request.grasp:
                    grasp = vision.compute_grasp(mask_array, width, height)
                    if grasp is not None:
                        detection.grasp = Grasp(**grasp)

        except HFError as exc:
            hint = exc.hint()
            segment_error = ApiError(
                stage="segment",
                status=exc.status,
                model=exc.model or config.SEGMENTATION_MODEL,
                message=f"{exc.message}\n\n{hint}" if hint else exc.message,
                partial=True,
            )
        except Exception as exc:  # noqa: BLE001 - a mask bug must not lose real detections
            segment_error = ApiError(
                stage="segment",
                model=config.SEGMENTATION_MODEL,
                message=f"Failed to process masks: {exc!r}",
                partial=True,
            )

    latency.total = round((time.perf_counter() - total_started) * 1000, 1)

    # --- Stage 3.5: FoundationPose Cloud 6D Pose Estimation & 3D Tracking ---
    await pose_6d_cloud.estimate_foundation_poses_cloud(http_client, detections, jpeg_bytes)

    # --- Stage 4: Decision & Inference Engine ---
    inference_result = inference.run_inference_engine(detections, weights=request.weights)


    return DetectResponse(
        ok=True,
        source=model_used.split("/")[-1],
        detections=detections,
        inference=inference_result,
        processed_width=width,
        processed_height=height,
        latency_ms=latency,
        # Present only when a secondary stage failed; the detections above are still real.
        error=segment_error,
        frame_id=request.frame_id,
    )


# --------------------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------------------


@app.get("/api/presets")
async def get_presets():
    """Return pre-configured tabletop benchmark scenes for offline / webcam-free demo testing."""
    return presets.PRESET_SCENES


class ManipulationPlanRequest(BaseModel):
    target_label: str
    pose_6d: dict
    prompt: str = ""


@app.post("/api/plan-manipulation")
async def plan_manipulation(req: ManipulationPlanRequest):
    """
    Generate Gemini Cognitive 5-phase manipulation plan with physical affordance reasoning.
    """
    plan = await gemini_client.generate_gemini_manipulation_plan(
        target_label=req.target_label,
        pose_6d=req.pose_6d,
        prompt=req.prompt,
        http_client=http_client,
    )
    return plan



@app.post("/api/sim/step")
async def sim_step(req: SimStepRequest):
    """Step PyBullet 3D physics simulator and return synthetic camera frame + telemetry."""
    return sim_server.sim_server.step(
        target_x=req.target_x,
        target_y=req.target_y,
        target_z=req.target_z,
        roll=req.roll,
        pitch=req.pitch,
        yaw=req.yaw,
        joints=req.joints,
    )


@app.get("/api/sim/reset")
async def sim_reset():
    """Reset PyBullet 3D physics simulation world."""
    sim_server.sim_server.init_simulation()
    return {"ok": True, "message": "PyBullet simulation world reset."}


# Global GUI process tracking
_gui_process = None


@app.post("/api/sim/launch-gui")
async def launch_sim_gui():
    """Launch Franka Emika Panda PyBullet native 3D desktop window."""
    global _gui_process
    import subprocess
    import sys
    from pathlib import Path

    # Check if already running
    if http_client is not None:
        try:
            resp = await http_client.get("http://127.0.0.1:8011/status", timeout=1.0)
            if resp.status_code == 200:
                return {"ok": True, "message": "Native 3D Simulator already active and connected."}
        except Exception:
            pass

    script_path = Path(__file__).parent / "native_sim.py"
    try:
        _gui_process = subprocess.Popen(
            [sys.executable, str(script_path)],
            cwd=str(Path(__file__).parent)
        )
        return {"ok": True, "message": "Franka Emika Panda 3D Desktop Simulator window launched!"}
    except Exception as exc:
        return {"ok": False, "message": f"Failed to launch native simulator: {exc}"}


@app.post("/api/sim/execute-grasp")
async def execute_sim_grasp(payload: dict):
    """Forward target grasp (X, Y, Z, Yaw) to the native 3D PyBullet Franka simulator."""
    if http_client is None:
        return {"ok": False, "message": "HTTP client offline"}
    try:
        resp = await http_client.post("http://127.0.0.1:8011/grasp", json=payload, timeout=2.0)
        return resp.json()
    except Exception as exc:
        return {"ok": False, "message": f"Desktop simulator not running: {exc}"}


@app.get("/api/sim/gui-status")
async def get_gui_status():
    """Check if native 3D PyBullet simulator window is connected."""
    if http_client is None:
        return {"ok": False, "connected": False}
    try:
        resp = await http_client.get("http://127.0.0.1:8011/status", timeout=0.8)
        return {"ok": True, "connected": resp.status_code == 200}
    except Exception:
        return {"ok": True, "connected": False}


@app.post("/api/benchmarks/run")
async def run_benchmarks():
    """Run automated batch evaluation across all benchmark dataset scenes."""
    if http_client is None:
        return {"ok": False, "message": "HTTP client not initialized"}
    return await benchmarks.run_batch_benchmark(http_client)




def _build_health() -> HealthResponse:
    """Shared body for both health routes."""
    configured, message = config.token_status()
    return HealthResponse(
        status="ok",
        token_configured=configured,
        token_message=message,
        detection_model=config.DETECTION_MODEL,
        segmentation_model=config.SEGMENTATION_MODEL,
        vlm_model=config.VLM_MODEL,
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness check that also reports whether a token is configured."""
    return _build_health()


@app.get("/api/health", response_model=HealthResponse)
async def api_health() -> HealthResponse:
    """
    Same as /health, under /api.

    The frontend dev server only proxies /api and /ws, so the browser needs this path.
    """
    return _build_health()


@app.websocket("/ws/stream")
async def stream(websocket: WebSocket) -> None:
    """
    Continuous detection over a WebSocket.

    Protocol: the client sends the same JSON body as /api/detect and gets the same response
    shape back, with `frame_id` echoed so replies can be matched to frames.

    BACKPRESSURE IS THE CLIENT'S JOB and is deliberately simple here: this loop handles
    exactly one frame at a time, so a client that fires faster than inference completes
    would just build a queue in the socket buffer and fall further behind. The frontend
    therefore waits for each response before sending the next frame (see useStream.js).

    A failure on one frame must never kill the stream — per-frame errors are sent back as
    normal error responses and the loop continues.
    """
    await websocket.accept()
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "?"
    print(f"[ws] client connected: {client}")

    frames = 0
    try:
        while True:
            message = await websocket.receive_json()
            frames += 1

            try:
                request = DetectRequest(**message)
            except Exception as exc:  # noqa: BLE001 - malformed frame, keep the stream alive
                await websocket.send_json(
                    DetectResponse(
                        ok=False,
                        frame_id=message.get("frame_id") if isinstance(message, dict) else None,
                        error=ApiError(
                            stage="decode",
                            message=f"Malformed request: {exc}",
                        ),
                    ).model_dump()
                )
                continue

            try:
                response = await run_detection(request)
            except Exception as exc:  # noqa: BLE001 - one bad frame must not drop the socket
                response = DetectResponse(
                    ok=False,
                    frame_id=request.frame_id,
                    error=ApiError(
                        stage="internal",
                        message=f"Unhandled backend error: {exc!r}",
                    ),
                )

            await websocket.send_json(response.model_dump())

    except WebSocketDisconnect:
        print(f"[ws] client disconnected: {client} after {frames} frame(s)")
    except Exception as exc:  # noqa: BLE001 - log and close cleanly
        print(f"[ws] stream error for {client}: {exc!r}")
        try:
            await websocket.close()
        except Exception:
            pass


@app.post("/api/detect", response_model=DetectResponse)
async def detect(request: DetectRequest) -> DetectResponse:
    """
    Detect objects in a single frame.

    Always returns HTTP 200 with an `ok` flag, so the frontend has exactly one response
    shape to handle and real error text is always reachable in the same place.
    """
    try:
        return await run_detection(request)
    except Exception as exc:  # noqa: BLE001 - never leak a stack trace as a fake result
        return DetectResponse(
            ok=False,
            frame_id=request.frame_id,
            error=ApiError(stage="internal", message=f"Unhandled backend error: {exc!r}"),
        )


@app.get("/api/config/colab-url")
def get_colab_url():
    """Returns current active Google Colab GPU FoundationPose endpoint URL."""
    return {"colab_url": getattr(config, "COLAB_6D_URL", "")}


@app.post("/api/config/colab-url")
def set_colab_url(payload: dict):
    """Sets custom Google Colab ngrok GPU URL dynamically from frontend."""
    url = payload.get("colab_url", "").strip().rstrip("/")
    setattr(config, "COLAB_6D_URL", url)
    return {"ok": True, "colab_url": url, "message": f"Connected to Colab FoundationPose GPU: {url or 'Default Mode'}"}

