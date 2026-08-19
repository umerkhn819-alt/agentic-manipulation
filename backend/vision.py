"""
Local image processing. No model inference happens here — this is pixel bookkeeping only.

Responsibilities:
  * decode the browser's base64 frame
  * compress it so uploads stay small and fast
  * convert upstream coordinates into the ONE normalized 0.0-1.0 convention

Later phases add mask decoding, mask-to-box matching, and grasp geometry to this file.
"""

from __future__ import annotations

import base64
import binascii
import io
import json

import numpy as np
from PIL import Image, UnidentifiedImageError

import config


class ImageError(Exception):
    """The incoming image could not be decoded or processed."""


def decode_base64_image(image_str: str) -> Image.Image:
    """
    Turn the browser's frame into a Pillow image.

    Accepts either a full data URL ("data:image/jpeg;base64,...") or a bare base64 string,
    since it is easy for a caller to send either.
    """
    if not image_str or not image_str.strip():
        raise ImageError("No image data was provided.")

    payload = image_str.strip()

    # Strip the data-URL prefix if present.
    if payload.startswith("data:"):
        if "," not in payload:
            raise ImageError("Malformed data URL: no comma separating header from data.")
        payload = payload.split(",", 1)[1]

    # Tolerate whitespace/newlines that can creep in through JSON transport.
    payload = "".join(payload.split())

    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageError(f"Image data is not valid base64: {exc}") from exc

    if not raw:
        raise ImageError("Image data decoded to zero bytes.")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()  # Force a full decode now so errors surface here, not later.
    except UnidentifiedImageError as exc:
        raise ImageError(
            "Decoded bytes are not a recognizable image format."
        ) from exc
    except Exception as exc:
        raise ImageError(f"Failed to decode image: {exc}") from exc

    return image


def compress_image(image: Image.Image) -> tuple[bytes, int, int]:
    """
    Shrink a frame to at most MAX_IMAGE_SIZE on its longest side and encode as JPEG.

    Returns (jpeg_bytes, width, height) where width/height are the ACTUAL dimensions after
    compression. Those dimensions are what upstream models see, so they are what absolute
    pixel coordinates coming back must be divided by.

    Aspect ratio is always preserved, and images already smaller than the limit are not
    upscaled.
    """
    # JPEG cannot store an alpha channel; convert modes that have one (or are palettized).
    if image.mode not in ("RGB",):
        image = image.convert("RGB")

    width, height = image.size
    if width == 0 or height == 0:
        raise ImageError(f"Image has an invalid size: {width}x{height}")

    longest = max(width, height)
    if longest > config.MAX_IMAGE_SIZE:
        scale = config.MAX_IMAGE_SIZE / longest
        # round() rather than int() to avoid a systematic 1px downward bias.
        new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=config.JPEG_QUALITY, optimize=True)

    final_width, final_height = image.size
    return buffer.getvalue(), final_width, final_height


def prepare_frame(image_str: str) -> tuple[bytes, int, int]:
    """Convenience wrapper: base64 in, compressed JPEG bytes + real dimensions out."""
    image = decode_base64_image(image_str)
    return compress_image(image)


# --------------------------------------------------------------------------------------
# Coordinate normalization
#
# THE one rule: everything leaving this backend is 0.0-1.0 relative to the frame.
# --------------------------------------------------------------------------------------


def _clamp01(value: float) -> float:
    """Keep a normalized coordinate inside the frame."""
    return max(0.0, min(1.0, value))


def normalize_detr_box(box: dict, width: int, height: int) -> dict[str, float] | None:
    """
    Convert one DETR box from absolute pixels to normalized 0.0-1.0.

    DETR returns {"xmin","ymin","xmax","ymax"} as integer pixels measured against the image
    we uploaded — so we divide by the COMPRESSED dimensions, not the browser's video size.

    Returns None for a degenerate (zero-area) box rather than emitting something undrawable.
    """
    try:
        xmin = float(box["xmin"])
        ymin = float(box["ymin"])
        xmax = float(box["xmax"])
        ymax = float(box["ymax"])
    except (KeyError, TypeError, ValueError):
        return None

    if width <= 0 or height <= 0:
        return None

    # Models occasionally emit inverted corners; normalize the ordering.
    if xmax < xmin:
        xmin, xmax = xmax, xmin
    if ymax < ymin:
        ymin, ymax = ymax, ymin

    normalized = {
        "x1": _clamp01(xmin / width),
        "y1": _clamp01(ymin / height),
        "x2": _clamp01(xmax / width),
        "y2": _clamp01(ymax / height),
    }

    # Drop boxes with no area — they cannot be drawn and carry no information.
    if normalized["x2"] <= normalized["x1"] or normalized["y2"] <= normalized["y1"]:
        return None

    return normalized


# --------------------------------------------------------------------------------------
# Segmentation masks
#
# Verified against the live model: masks arrive as base64 PNG, mode "L", binary (only 0 and
# 255), at exactly the resolution we uploaded, one per OBJECT INSTANCE (two cats produce two
# separate masks). The resize path below still exists because that is a property of the
# current model, not a guarantee of the API.
# --------------------------------------------------------------------------------------


def decode_mask(mask_b64: str, width: int, height: int) -> np.ndarray | None:
    """
    Decode a base64 PNG mask into a boolean numpy array.

    Resizes to (width, height) if the model returned a different resolution — NEAREST so
    the mask stays strictly binary instead of gaining interpolated edge values.

    Returns None if the mask cannot be decoded or is empty; callers treat that as "no mask",
    never as an empty-but-valid shape.
    """
    if not mask_b64:
        return None

    try:
        payload = mask_b64
        if payload.startswith("data:"):
            payload = payload.split(",", 1)[1]
        raw = base64.b64decode(payload)
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception:
        return None

    if image.mode != "L":
        image = image.convert("L")

    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.NEAREST)

    array = np.array(image) > 127
    if not array.any():
        return None  # Empty mask carries no information.
    return array


def mask_bounding_box(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Tight pixel bounding box (x1, y1, x2, y2) around the True pixels of a mask."""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None

    y1, y2 = np.where(rows)[0][[0, -1]]
    x1, x2 = np.where(cols)[0][[0, -1]]
    # +1 so the box is exclusive at the far edge, matching slice semantics.
    return int(x1), int(y1), int(x2) + 1, int(y2) + 1


def _box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    """Intersection-over-union of two (x1, y1, x2, y2) boxes."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    intersection = (ix2 - ix1) * (iy2 - iy1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - intersection
    return intersection / union if union > 0 else 0.0


def _clip_mask_to_box(
    mask: np.ndarray, box_px: tuple[int, int, int, int], width: int, height: int
) -> np.ndarray:
    """
    Keep only the part of a mask that lies inside a detection's box.

    Panoptic segmentation sometimes returns one sprawling blob for a class rather than a
    tidy per-object silhouette (verified on a real frame: a "cat" mask spanned the entire
    image while covering only ~51% of the cat it was matched to). Clipping keeps each
    detection's mask to its own object, which is what per-object grasp geometry requires.

    This narrows a real mask; it never adds pixels the model did not report.
    """
    x1 = max(0, min(width, int(box_px[0])))
    y1 = max(0, min(height, int(box_px[1])))
    x2 = max(0, min(width, int(box_px[2])))
    y2 = max(0, min(height, int(box_px[3])))

    clipped = np.zeros_like(mask)
    if x2 > x1 and y2 > y1:
        clipped[y1:y2, x1:x2] = mask[y1:y2, x1:x2]
    return clipped


def _pixel_iou(mask: np.ndarray, box_px: tuple[int, int, int, int], width: int, height: int) -> tuple[float, float]:
    """
    Compare a mask against a box at PIXEL level, not bounding-box level.

    Returns (iou, containment):
      iou         - overlap / (mask + box - overlap); how well the two agree overall
      containment - overlap / mask total; how much of the mask sits inside the box

    Bounding-box IoU is misleading for irregular silhouettes: a diagonal or sprawling shape
    has a bbox far larger than the shape itself, so two unrelated objects can score highly.
    Comparing actual pixels avoids that.
    """
    x1 = max(0, min(width, int(box_px[0])))
    y1 = max(0, min(height, int(box_px[1])))
    x2 = max(0, min(width, int(box_px[2])))
    y2 = max(0, min(height, int(box_px[3])))

    if x2 <= x1 or y2 <= y1:
        return 0.0, 0.0

    mask_total = int(mask.sum())
    if mask_total == 0:
        return 0.0, 0.0

    overlap = int(mask[y1:y2, x1:x2].sum())
    if overlap == 0:
        return 0.0, 0.0

    box_area = (x2 - x1) * (y2 - y1)
    union = mask_total + box_area - overlap
    return (overlap / union if union > 0 else 0.0), overlap / mask_total


def match_masks_to_boxes(
    segments: list[dict],
    detections: list[dict],
    width: int,
    height: int,
) -> dict[int, tuple[np.ndarray, float]]:
    """
    Pair each detection box with the segmentation mask that best explains it.

    Matching uses PIXEL-level IoU (see _pixel_iou) rather than bounding-box overlap, and the
    winning mask is CLIPPED to the detection's box so each object gets its own silhouette.

    Both models share the COCO label space, so agreeing labels are strong evidence and get a
    ranking bonus; a differently-labelled mask must score well above the floor to win.

    Greedy: the strongest pairs commit first and each mask is claimed at most once, so two
    cats end up with two different masks instead of both grabbing the same one.

    Returns {detection_index: (clipped_mask, iou)}. Detections with no acceptable mask are
    absent from the result — the caller then reports mask=None rather than inventing one.
    """
    decoded: list[tuple[np.ndarray, str]] = []
    for segment in segments:
        mask = decode_mask(segment.get("mask", ""), width, height)
        if mask is None:
            continue
        decoded.append((mask, str(segment.get("label", "")).lower()))

    if not decoded:
        return {}

    # Score every (detection, mask) pair.
    candidates: list[tuple[float, float, int, int]] = []
    for det_index, detection in enumerate(detections):
        box = detection["box"]
        det_box_px = (
            box["x1"] * width,
            box["y1"] * height,
            box["x2"] * width,
            box["y2"] * height,
        )
        det_label = str(detection.get("label", "")).lower()

        for mask_index, (mask, mask_label) in enumerate(decoded):
            iou, containment = _pixel_iou(mask, det_box_px, width, height)
            if iou <= 0:
                continue

            labels_agree = (
                det_label == mask_label
                or det_label in mask_label
                or mask_label in det_label
            )

            # Either measure can qualify a pair: a tight silhouette scores well on IoU,
            # while a piece of a sprawling blob scores well on containment. Requiring both
            # would reject the sprawling case that clipping exists to handle.
            quality = max(iou, containment * 0.8)
            floor = config.MASK_MATCH_MIN_IOU if labels_agree else config.MASK_MATCH_MIN_IOU + 0.25
            if quality < floor:
                continue

            rank = quality + (0.15 if labels_agree else 0.0)
            candidates.append((rank, iou, det_index, mask_index))

    # Commit best pairs first; each detection and each mask is used at most once.
    candidates.sort(reverse=True)
    matches: dict[int, tuple[np.ndarray, float]] = {}
    used_masks: set[int] = set()

    for _rank, iou, det_index, mask_index in candidates:
        if det_index in matches or mask_index in used_masks:
            continue

        mask, _ = decoded[mask_index]
        box = detections[det_index]["box"]
        det_box_px = (
            box["x1"] * width,
            box["y1"] * height,
            box["x2"] * width,
            box["y2"] * height,
        )

        clipped = _clip_mask_to_box(mask, det_box_px, width, height)
        if not clipped.any():
            continue  # Nothing left after clipping — not a usable match.

        # Report the real geometric IoU, without the label bonus baked in.
        matches[det_index] = (clipped, round(iou, 3))
        used_masks.add(mask_index)

    return matches


def compute_grasp(mask: np.ndarray, width: int, height: int) -> dict | None:
    """
    Propose where a two-fingered gripper should close on this object.

    Everything is derived from the REAL segmentation mask — nothing is guessed from the
    bounding box, and None is returned when the mask is too small to be meaningful.

    The geometry, in three steps:

    1. CENTROID — the mask's centre of mass (image moments). Unlike the box centre this
       stays ON the object for L-shaped or handled things: the box centre of a mug with a
       handle can sit in empty air, the centroid cannot.

    2. LONG AXIS — from second-order central moments,
           theta = 0.5 * atan2(2*mu11, mu20 - mu02)
       gives the direction the object is most elongated along.

    3. CLOSING AXIS — the jaws must close ACROSS the object, so they travel perpendicular to
       the long axis. Ray-marching out from the centroid along that perpendicular until we
       leave the mask gives the two real contact points and the true gripper width.
    """
    ys, xs = np.nonzero(mask)
    area = xs.size
    # Too few pixels for the moment maths to mean anything.
    if area < 20:
        return None

    # --- 1. Centroid (first-order moments) ---
    cx = float(xs.mean())
    cy = float(ys.mean())

    # --- 2. Orientation (second-order central moments) ---
    #
    # These MUST be measured about the true centre of mass — that is what makes them central
    # moments. Computing them about a shifted point would tilt the reported axis.
    dx = xs - cx
    dy = ys - cy
    mu20 = float((dx * dx).mean())
    mu02 = float((dy * dy).mean())
    mu11 = float((dx * dy).mean())

    # Angle of the object's LONG axis.
    theta = 0.5 * np.arctan2(2.0 * mu11, mu20 - mu02)

    # --- 2b. Move the grasp point onto the object if the centroid missed it ---
    #
    # For a CONCAVE shape the centre of mass can land in a hole. The classic case is an
    # L-shape, whose centroid sits in the empty notch between the two arms — verified: an L
    # with arms at x120-160 and y240-280 puts its centroid at (173,225), on neither arm. A
    # gripper told to close there would clamp thin air.
    #
    # Done AFTER the moments so the orientation stays correct, and by snapping to the
    # nearest pixel that really belongs to the mask — this relocates onto real data rather
    # than inventing a position.
    if not mask[int(round(cy)), int(round(cx))]:
        distances = (xs - cx) ** 2 + (ys - cy) ** 2
        nearest = int(np.argmin(distances))
        cx = float(xs[nearest])
        cy = float(ys[nearest])

    # --- 3. Jaw contact points, perpendicular to the long axis ---
    closing = theta + np.pi / 2.0
    step_x = float(np.cos(closing))
    step_y = float(np.sin(closing))

    def march(direction: int) -> tuple[float, float]:
        """
        Walk outward from the grasp point until we leave the mask, and return the last
        pixel that was still inside.

        Returns the INTEGER pixel that was actually tested, not the float position along
        the ray. Returning the float would let a jaw reported at x=175.6 have been
        validated at pixel 176 while a consumer truncating to 175 finds itself outside the
        object — a contact point that is off the object is worse than useless to a gripper.
        """
        last_x, last_y = int(round(cx)), int(round(cy))
        # Cap the walk at the frame diagonal so it always terminates.
        limit = int(np.hypot(width, height))
        for step in range(1, limit):
            xi = int(round(cx + step_x * step * direction))
            yi = int(round(cy + step_y * step * direction))
            if xi < 0 or yi < 0 or xi >= width or yi >= height:
                break
            if not mask[yi, xi]:
                break
            last_x, last_y = xi, yi
        return float(last_x), float(last_y)

    jaw_a = march(1)
    jaw_b = march(-1)

    jaw_width_px = float(np.hypot(jaw_a[0] - jaw_b[0], jaw_a[1] - jaw_b[1]))

    # Report the closing angle in degrees, normalized to 0-180 (a gripper is symmetric, so
    # 190 degrees and 10 degrees are the same grasp).
    angle_deg = float(np.degrees(closing) % 180.0)

    return {
        "x": _clamp01(cx / width),
        "y": _clamp01(cy / height),
        "angle_deg": round(angle_deg, 1),
        # Normalized to frame WIDTH so it stays comparable across aspect ratios.
        "width_norm": round(jaw_width_px / width, 4),
        "jaws": [
            {"x": _clamp01(jaw_a[0] / width), "y": _clamp01(jaw_a[1] / height)},
            {"x": _clamp01(jaw_b[0] / width), "y": _clamp01(jaw_b[1] / height)},
        ],
    }


def encode_mask_png(mask: np.ndarray) -> str:
    """
    Encode a boolean mask as a base64 PNG data URL the browser can tint directly.

    IMPORTANT — why RGBA and not 1-bit grayscale:
    The object pixels are opaque white and everything else is FULLY TRANSPARENT. That lets
    the canvas tint the silhouette with `globalCompositeOperation = 'source-in'` and paint
    only the object. A 1-bit or grayscale PNG is opaque everywhere (black background rather
    than no background), so tinting it would colour the whole rectangle instead of the shape.

    PNG compresses the large uniform transparent region well, so this stays a few KB even at
    640x480.
    """
    height, width = mask.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = 255                      # White, so a tint multiplies cleanly.
    rgba[..., 3] = mask.astype(np.uint8) * 255  # Alpha carries the silhouette.

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# --------------------------------------------------------------------------------------
# Vision-language model output parsing (zero-shot path)
# --------------------------------------------------------------------------------------


class VLMParseError(Exception):
    """
    The vision-language model replied, but not with parseable boxes.

    This is deliberately a distinct error rather than "zero detections". An empty result
    would read as "nothing is there", which is a very different claim from "the model said
    something we could not understand".
    """

    def __init__(self, message: str, raw_text: str) -> None:
        super().__init__(message)
        self.message = message
        self.raw_text = raw_text


def _extract_json_array(text: str) -> str | None:
    """
    Pull the first balanced JSON array out of a model reply.

    Models wrap output in ```json fences or add a sentence of preamble even when told not
    to, so we scan for the array rather than trusting the whole string to be JSON. Bracket
    counting (rather than a regex) keeps nested arrays like "bbox_2d": [...] intact.
    """
    start = text.find("[")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        # Track string state so brackets inside labels don't affect nesting.
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    return None


def parse_vlm_detections(raw_text: str) -> list[dict]:
    """
    Turn a vision-language model's reply into normalized detections.

    COORDINATE CONVERSION — the critical part:
    Qwen3-VL emits bbox_2d normalized to a 0-1000 grid, NOT absolute pixels. (This changed
    from Qwen2.5-VL, which used absolute pixels. Assuming pixels here would squash every
    box into the top-left corner of the frame.) So we divide by 1000 to reach our 0.0-1.0
    convention.

    Raises VLMParseError when the reply cannot be understood, rather than returning [].
    """
    if not raw_text or not raw_text.strip():
        raise VLMParseError("The model returned an empty response.", raw_text or "")

    json_text = _extract_json_array(raw_text)
    if json_text is None:
        raise VLMParseError(
            "The model's reply contained no JSON array of boxes.", raw_text
        )

    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise VLMParseError(f"Could not parse the model's JSON: {exc}", raw_text) from exc

    if not isinstance(parsed, list):
        raise VLMParseError(
            f"Expected a JSON array of boxes, got {type(parsed).__name__}.", raw_text
        )

    detections: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue

        # Accept the common key spellings; models are inconsistent about this.
        bbox = item.get("bbox_2d") or item.get("bbox") or item.get("box")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            continue

        try:
            x1, y1, x2, y2 = (float(value) for value in bbox)
        except (TypeError, ValueError):
            continue

        # 0-1000 grid -> 0.0-1.0.
        x1, y1, x2, y2 = x1 / 1000.0, y1 / 1000.0, x2 / 1000.0, y2 / 1000.0

        # Models occasionally emit inverted corners.
        if x2 < x1:
            x1, x2 = x2, x1
        if y2 < y1:
            y1, y2 = y2, y1

        box = {
            "x1": _clamp01(x1),
            "y1": _clamp01(y1),
            "x2": _clamp01(x2),
            "y2": _clamp01(y2),
        }

        # Drop anything with no area — undrawable and meaningless.
        if box["x2"] <= box["x1"] or box["y2"] <= box["y1"]:
            continue

        # Models sometimes echo the prompt's punctuation into the label ("pink blanket.").
        # Tidy it so the on-canvas chip reads cleanly.
        label = str(item.get("label") or item.get("name") or "object").strip()
        label = label.strip(" .,;:\"'").strip() or "object"

        detections.append({"label": label, "box": box})

    # An empty list here is a REAL "the model found nothing" answer, since the JSON parsed
    # correctly. That is different from the parse failures raised above.
    return detections


# --------------------------------------------------------------------------------------
# Prompt filtering
# --------------------------------------------------------------------------------------


def parse_prompt_terms(prompt: str) -> list[str]:
    """
    Split a prompt into search terms.

    Accepts the Grounding-DINO-style "cup . bottle . spoon" format as well as commas and
    newlines, so muscle memory from the original brief still works.
    """
    if not prompt:
        return []

    normalized = prompt.replace("\n", ",").replace(".", ",")
    terms = [term.strip().lower() for term in normalized.split(",")]
    return [term for term in terms if term]


def filter_detections_by_prompt(detections: list[dict], prompt: str) -> list[dict]:
    """
    Keep only detections whose label matches one of the prompt's terms.

    DETR always returns all 80 COCO classes it finds, so the prompt acts as a filter here
    (unlike zero-shot mode, where the prompt drives the model itself).

    An empty prompt means "show everything" rather than "show nothing", which is the more
    useful default when the box is cleared.
    """
    terms = parse_prompt_terms(prompt)
    if not terms:
        return detections

    matched = []
    for detection in detections:
        label = str(detection.get("label", "")).lower()
        # Substring matching both ways so "cup" finds "coffee cup" and vice versa.
        if any(term in label or label in term for term in terms):
            matched.append(detection)
    return matched
