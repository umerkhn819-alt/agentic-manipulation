"""
Send a real local image file to the running backend and print the real detections.

This is the Phase 1 verification tool. It does not mock anything: it posts an actual photo
to the actual endpoint, which calls the actual Hugging Face API.

Usage:
    python test_api.py path/to/photo.jpg
    python test_api.py path/to/photo.jpg --prompt "cup"
    python test_api.py path/to/photo.jpg --prompt ""        # show every class found
    python test_api.py --self-test                          # check compression, no network

Exits 0 on success, 1 on failure — so it is usable in a script.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

import httpx

DEFAULT_URL = "http://localhost:8000"


def encode_image(path: Path) -> str:
    """Read an image file and wrap it as a data URL, the same way the browser will."""
    raw = path.read_bytes()
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def print_error(error: dict) -> None:
    """Print an error block exactly as the server reported it."""
    print("\n  DETECTION FAILED — this is the real error from the server:\n")
    print(f"    stage:  {error.get('stage')}")
    if error.get("status") is not None:
        print(f"    status: HTTP {error.get('status')}")
    if error.get("model"):
        print(f"    model:  {error.get('model')}")
    print(f"    message:")
    for line in str(error.get("message", "")).splitlines():
        print(f"      {line}")
    print()


def print_detections(payload: dict) -> None:
    """Pretty-print the real detections returned by the API."""
    detections = payload.get("detections", [])
    latency = payload.get("latency_ms", {}) or {}
    width = payload.get("processed_width")
    height = payload.get("processed_height")

    print(f"\n  Served by:  {payload.get('source')}")
    print(f"  Uploaded:   {width}x{height} JPEG (compressed from the original)")
    print(
        f"  Latency:    compress {latency.get('compress')}ms | "
        f"detect {latency.get('detect')}ms | total {latency.get('total')}ms"
    )

    if not detections:
        print("\n  No objects matched.")
        print("  This is a real empty result, not an error. Try --prompt \"\" to see")
        print("  every class the model found in the image.\n")
        return

    print(f"\n  {len(detections)} detection(s):\n")
    header = f"  {'LABEL':<18} {'SCORE':>7}   BOX (normalized 0-1)"
    print(header)
    print("  " + "-" * (len(header) - 2))

    for detection in detections:
        box = detection["box"]
        score = detection.get("score")
        score_text = f"{score * 100:6.1f}%" if score is not None else "     --"
        box_text = (
            f"x1={box['x1']:.3f} y1={box['y1']:.3f} "
            f"x2={box['x2']:.3f} y2={box['y2']:.3f}"
        )
        print(f"  {detection['label']:<18} {score_text}   {box_text}")

    # Show pixel coordinates too, since normalized values are hard to sanity-check by eye.
    if width and height:
        print(f"\n  Same boxes in pixels of the uploaded {width}x{height} image:\n")
        for detection in detections:
            box = detection["box"]
            print(
                f"  {detection['label']:<18} "
                f"({box['x1'] * width:.0f}, {box['y1'] * height:.0f}) -> "
                f"({box['x2'] * width:.0f}, {box['y2'] * height:.0f})"
            )
    print()


def check_health(base_url: str) -> bool:
    """Confirm the server is up and report whether it has a token before we send a frame."""
    try:
        response = httpx.get(f"{base_url}/health", timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"\n  Could not reach the backend at {base_url}")
        print(f"  {exc}\n")
        print("  Start it first, in a separate terminal:")
        print("      cd backend")
        print("      uvicorn main:app --reload --port 8000\n")
        return False

    payload = response.json()
    print(f"  Backend:    up at {base_url}")
    print(f"  Models:     {payload.get('detection_model')}")

    if not payload.get("token_configured"):
        print("\n  NOTE: no Hugging Face token is configured.")
        print("  The request below will return a real 'config' error rather than results.")
    return True


def self_test() -> int:
    """
    Verify the local image pipeline without touching the network.

    Confirms compression really does cap the longest side and preserve aspect ratio, and
    that coordinate normalization round-trips correctly.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from PIL import Image

    import config
    import vision

    print("\n  Local self-test (no network, no API calls)\n")
    failures = 0

    # 1. Compression caps the longest side and preserves aspect ratio.
    for original in [(1920, 1080), (720, 1280), (400, 300)]:
        image = Image.new("RGB", original, (120, 30, 30))
        _, width, height = vision.compress_image(image)
        longest = max(width, height)
        expected_longest = min(max(original), config.MAX_IMAGE_SIZE)
        original_ratio = original[0] / original[1]
        new_ratio = width / height

        ok = longest == expected_longest and abs(original_ratio - new_ratio) < 0.01
        failures += 0 if ok else 1
        print(
            f"    {'PASS' if ok else 'FAIL'}  {original[0]}x{original[1]} -> {width}x{height}"
            f"  (longest {longest}, expected {expected_longest})"
        )

    # 2. A round-trip through base64 produces a valid, compressible image.
    image = Image.new("RGB", (1000, 500), (10, 90, 160))
    import io

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    data_url = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
    _, width, height = vision.prepare_frame(data_url)
    ok = (width, height) == (640, 320)
    failures += 0 if ok else 1
    print(f"    {'PASS' if ok else 'FAIL'}  data URL round-trip -> {width}x{height} (expected 640x320)")

    # 3. Box normalization divides by the compressed dimensions.
    box = {"xmin": 64, "ymin": 32, "xmax": 320, "ymax": 160}
    normalized = vision.normalize_detr_box(box, 640, 320)
    ok = normalized is not None and abs(normalized["x1"] - 0.1) < 1e-6 and abs(
        normalized["y2"] - 0.5
    ) < 1e-6
    failures += 0 if ok else 1
    print(f"    {'PASS' if ok else 'FAIL'}  box normalization -> {normalized}")

    # 4. A zero-area box is rejected rather than emitted.
    degenerate = vision.normalize_detr_box(
        {"xmin": 10, "ymin": 10, "xmax": 10, "ymax": 50}, 640, 320
    )
    ok = degenerate is None
    failures += 0 if ok else 1
    print(f"    {'PASS' if ok else 'FAIL'}  zero-area box rejected -> {degenerate}")

    # 5. Prompt parsing handles the "cup . bottle" style from the original brief.
    terms = vision.parse_prompt_terms("cup . bottle, spoon")
    ok = terms == ["cup", "bottle", "spoon"]
    failures += 0 if ok else 1
    print(f"    {'PASS' if ok else 'FAIL'}  prompt parsing -> {terms}")

    # 6. An empty prompt means "show everything", not "show nothing".
    sample = [{"label": "cup"}, {"label": "person"}]
    ok = len(vision.filter_detections_by_prompt(sample, "")) == 2
    failures += 0 if ok else 1
    print(f"    {'PASS' if ok else 'FAIL'}  empty prompt keeps all detections")

    print(f"\n  {'All self-tests passed.' if failures == 0 else f'{failures} self-test(s) FAILED.'}\n")
    return 0 if failures == 0 else 1


def check_token() -> int:
    """
    Make ONE real call to Hugging Face to prove the token works.

    Talks straight to the API — the backend server does not need to be running. This is
    the fastest way to confirm a freshly-pasted token before doing anything else.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import asyncio
    import io

    from PIL import Image

    import config
    import hf_client
    from hf_client import HFError

    print("\n" + "=" * 74)
    print("  Hugging Face token check")
    print("=" * 74 + "\n")

    print(f"  Reading token from: {config.ENV_PATH}")

    configured, message = config.token_status()
    if not configured:
        print(f"\n  [X] {message}\n")
        return 1

    print(f"  {message}")
    print(f"  Calling {config.DETECTION_MODEL} with a small test image ...\n")

    # A tiny generated image — what it shows does not matter, only whether we are allowed in.
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (127, 127, 127)).save(buffer, format="JPEG")
    test_bytes = buffer.getvalue()

    async def run() -> int:
        import httpx

        async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT_S) as client:
            try:
                result = await hf_client.post_image(
                    client, config.DETECTION_MODEL, test_bytes
                )
            except HFError as exc:
                status = f"HTTP {exc.status}" if exc.status else "no response"
                print(f"  [X] FAILED — {status}")
                print(f"      {exc.message}")
                hint = exc.hint()
                if hint:
                    print(f"\n      {hint}")
                print()
                return 1

            print("  [OK] The token works. Real inference is available.")
            print(f"       HTTP 200, {len(result)} detection(s) on the blank test image")
            print("       (zero detections on a blank grey square is the correct result)\n")
            print("  Next: point it at a real photo —")
            print("       python test_api.py C:\\path\\to\\cup.jpg\n")
            return 0

    return asyncio.run(run())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send a real image to the backend and print the real detections."
    )
    parser.add_argument("image", nargs="?", help="Path to a .jpg or .png file")
    parser.add_argument(
        "--prompt",
        default="cup",
        help='Objects to look for. Empty string shows everything. Default: "cup"',
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Backend URL (default {DEFAULT_URL})")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run local image-pipeline checks without any network calls",
    )
    parser.add_argument(
        "--check-token",
        action="store_true",
        help="Make one real call to Hugging Face to verify the token (no server needed)",
    )
    parser.add_argument("--json", action="store_true", help="Print the raw JSON response")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if args.check_token:
        return check_token()

    if not args.image:
        parser.error("an image path is required (or use --self-test)")

    path = Path(args.image)
    if not path.exists():
        print(f"\n  File not found: {path.resolve()}\n")
        return 1

    print("\n" + "=" * 74)
    print("  Robot Vision — real detection test")
    print("=" * 74 + "\n")
    print(f"  Image:      {path.resolve()}  ({path.stat().st_size / 1024:.0f} KB)")
    print(f"  Prompt:     {args.prompt!r}" + ("  (empty = show everything)" if not args.prompt else ""))

    if not check_health(args.url):
        return 1

    print("\n  Sending frame to /api/detect ...")

    try:
        response = httpx.post(
            f"{args.url}/api/detect",
            json={"image": encode_image(path), "prompt": args.prompt, "zero_shot": False},
            timeout=120,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"\n  Request failed: {exc}\n")
        return 1

    payload = response.json()

    if args.json:
        print("\n" + json.dumps(payload, indent=2))

    if not payload.get("ok"):
        print_error(payload.get("error") or {"message": "Unknown error"})
        return 1

    print_detections(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
