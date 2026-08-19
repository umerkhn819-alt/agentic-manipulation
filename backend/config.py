"""
Configuration and environment loading.

Everything the app needs to talk to Hugging Face lives here, so there is exactly one
place to change a model ID or an endpoint.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# The .env file lives at the PROJECT ROOT (one level above backend/), so that both the
# backend and any future tooling read the same file.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

load_dotenv(ENV_PATH)


# --------------------------------------------------------------------------------------
# Hugging Face API
# --------------------------------------------------------------------------------------

# IMPORTANT: The old "https://api-inference.huggingface.co" host is SHUT DOWN. It now
# responds with: "no longer supported. Please use https://router.huggingface.co/hf-inference
# instead." All calls go through the router below.
ROUTER_BASE = "https://router.huggingface.co"

# Task-model endpoints (image in, JSON out) are served by the "hf-inference" provider.
HF_INFERENCE_BASE = f"{ROUTER_BASE}/hf-inference/models"

# Chat-style models (used for the zero-shot VLM path in Phase 3) use the
# OpenAI-compatible chat completions route instead.
CHAT_COMPLETIONS_URL = f"{ROUTER_BASE}/v1/chat/completions"

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY", "").strip()
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
COLAB_6D_URL = os.getenv("COLAB_6D_URL", "https://wise-streets-tease.loca.lt").strip()

# A token that is still the placeholder from .env.example is treated as missing.
if HF_API_KEY == "hf_your_token_here":
    HF_API_KEY = ""


# --------------------------------------------------------------------------------------
# Physical Gripper Specification & Inference Engine Weights
# --------------------------------------------------------------------------------------

# Parallel-Jaw Gripper specifications (in normalized frame width units: 0.0 - 1.0)
GRIPPER_MIN_JAW_WIDTH = 0.03   # 3% of frame width (~19px at 640px)
GRIPPER_MAX_JAW_WIDTH = 0.35   # 35% of frame width (~224px at 640px)
GRIPPER_OPTIMAL_JAW_WIDTH = 0.12 # Ideal jaw opening (~77px at 640px)

# Multi-Criteria Utility Scoring Weights (sum = 1.0)
WEIGHT_VISION_SCORE = 0.25     # Raw detection confidence score
WEIGHT_MASK_QUALITY = 0.25     # IoU match score between mask & bounding box
WEIGHT_JAW_FIT = 0.20          # Gripper physical opening fit
WEIGHT_CENTERING = 0.15        # Distance to workspace center (reachability)
WEIGHT_ORIENTATION = 0.15      # Stability of grasp angle



# --------------------------------------------------------------------------------------
# Models
#
# These were each verified as live on the Inference API. The models in the original brief
# (grounding-dino-tiny, sam2-hiera-small, Depth-Anything-V2) are NOT available — their
# entire task types (zero-shot-object-detection, mask-generation, depth-estimation) are
# served by zero providers.
# --------------------------------------------------------------------------------------

# Object detection: 80 COCO classes, CPU, fast and reliable.
DETECTION_MODEL = "facebook/detr-resnet-50"

# Panoptic segmentation: per-INSTANCE masks in the same COCO label space as DETR, so masks
# can be matched to detection boxes and two cups stay two separate objects.
SEGMENTATION_MODEL = "facebook/mask2former-swin-tiny-coco-panoptic"

# Vision-language model for the zero-shot (free-text prompt) detection path.
#
# NOTE 1: this model emits bounding boxes normalized to 0-1000, NOT absolute pixels.
#         vision.parse_vlm_detections() divides by 1000 to reach our 0.0-1.0 convention.
# NOTE 2: the 8B variant is NOT served by any provider — the router rejects it with
#         "not supported by any provider you have enabled". This 30B mixture-of-experts
#         model activates only ~3B parameters per token, so it stays reasonably fast.
#         Check what your token can reach with:
#             curl https://router.huggingface.co/v1/models -H "Authorization: Bearer hf_..."
VLM_MODEL = "Qwen/Qwen3-VL-30B-A3B-Instruct"


# --------------------------------------------------------------------------------------
# Image handling
# --------------------------------------------------------------------------------------

# Longest side of the frame sent upstream. Smaller = faster upload and inference.
MAX_IMAGE_SIZE = int(os.getenv("MAX_IMAGE_SIZE", "640"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "85"))


# --------------------------------------------------------------------------------------
# Inference behaviour
# --------------------------------------------------------------------------------------

# Detections below this confidence are dropped.
DETECTION_THRESHOLD = float(os.getenv("DETECTION_THRESHOLD", "0.5"))

# A returned mask must overlap a detection box by at least this IoU to be considered a
# match. Below it, the detection honestly reports "no mask found" rather than guessing.
MASK_MATCH_MIN_IOU = float(os.getenv("MASK_MATCH_MIN_IOU", "0.3"))

# How long to wait on a single upstream HTTP call.
REQUEST_TIMEOUT_S = float(os.getenv("REQUEST_TIMEOUT_S", "60"))

# Cold-start (HTTP 503) retry policy. HF returns an "estimated_time" telling us how long
# the model needs to load; we wait that long (capped) and retry.
MAX_COLD_START_RETRIES = 2
MAX_COLD_START_WAIT_S = 20.0

# Port this backend listens on. Override in .env if something else already owns 8000
# (a port clash shows up as "[Errno 10048] only one usage of each socket address").
API_PORT = int(os.getenv("API_PORT", "8000"))

# Frontend dev server origins allowed to call this backend.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def token_status() -> tuple[bool, str]:
    """
    Report whether a usable token is configured.

    Returns (is_configured, human_readable_message). Used by the startup validator so the
    setup problem is stated plainly instead of surfacing later as a confusing 401.
    """
    if not HF_API_KEY:
        token_url = (
            "https://huggingface.co/settings/tokens/new"
            "?ownUserPermissions=inference.serverless.write&tokenType=fineGrained"
        )
        # Tailor the instructions to what is actually on disk, so the next step is never
        # ambiguous: creating the file and editing it are different problems.
        if ENV_PATH.exists():
            first_step = (
                f"  1. Open this file:  {ENV_PATH}\n"
                f"     It still contains the placeholder 'hf_your_token_here'."
            )
        else:
            first_step = (
                f"  1. Create the file:  {ENV_PATH}\n"
                f"     (copy .env.example to .env)"
            )

        return False, (
            f"HUGGINGFACE_API_KEY is not set.\n"
            f"{first_step}\n"
            f"  2. Create a FINE-GRAINED token with the 'Inference Providers' permission:\n"
            f"     {token_url}\n"
            f"  3. Replace the placeholder with your token:\n"
            f"     HUGGINGFACE_API_KEY=hf_...\n"
            f"     (No quotes. A read-only token returns 403 on these endpoints.)"
        )

    if not HF_API_KEY.startswith("hf_"):
        return False, (
            "HUGGINGFACE_API_KEY does not start with 'hf_', which is unusual for a "
            "Hugging Face token. Double-check it was pasted correctly."
        )

    # Show only a prefix/suffix so the token never lands in logs in full.
    masked = f"{HF_API_KEY[:6]}...{HF_API_KEY[-4:]}"
    return True, f"HUGGINGFACE_API_KEY loaded ({masked})"
