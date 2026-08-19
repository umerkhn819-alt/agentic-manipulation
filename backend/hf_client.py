"""
Async HTTP client for the Hugging Face Inference API.

This module is the ONLY place that talks to Hugging Face. It enforces the project's
central rule: a failed call raises a typed error carrying the REAL upstream status and
body. Nothing here ever returns a fabricated or default result on failure.

Endpoint note: the legacy host `api-inference.huggingface.co` is shut down and responds
with "no longer supported". Everything goes through `router.huggingface.co`.
"""

from __future__ import annotations

import asyncio
import base64

import httpx

import config


class HFError(Exception):
    """
    A real failure talking to Hugging Face.

    Carries the actual HTTP status and response body so the UI can display exactly what
    the service said, rather than a paraphrase.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        model: str | None = None,
        stage: str = "detect",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.model = model
        self.stage = stage

    def hint(self) -> str:
        """A plain-language suggestion for the common, fixable HTTP statuses."""
        if self.status == 401:
            return (
                "The token was rejected. Check HUGGINGFACE_API_KEY in .env is a valid, "
                "current token."
            )
        if self.status == 403:
            return (
                "The token is valid but lacks permission. It must be a FINE-GRAINED token "
                "with the 'Inference Providers' (inference.serverless.write) permission — "
                "a read-only token gets 403 here."
            )
        if self.status == 402:
            return (
                "Inference credits are exhausted for this account. Check usage at "
                "https://huggingface.co/settings/billing"
            )
        if self.status == 404:
            return (
                f"The model '{self.model}' is not served by this provider. Availability "
                "changes over time; check "
                "https://huggingface.co/models?inference_provider=hf-inference"
            )
        if self.status == 429:
            return "Rate limited. Slow down the request rate and try again."
        if self.status == 503:
            return (
                "The model is still cold after retries. Wait a moment and try again."
            )
        return ""


def _auth_headers() -> dict[str, str]:
    """Build the auth header, failing early and clearly if no token is configured."""
    if not config.HF_API_KEY:
        _, msg = config.token_status()
        raise HFError(msg, status=None, model=None, stage="config")
    return {"Authorization": f"Bearer {config.HF_API_KEY}"}


def _extract_error_body(response: httpx.Response) -> str:
    """
    Pull the most useful text out of an error response, verbatim.

    Hugging Face returns errors as JSON ({"error": "..."}) in most cases but plain text in
    others, so we handle both and never lose the real message.
    """
    try:
        payload = response.json()
    except Exception:
        return response.text.strip() or f"HTTP {response.status_code} (empty response body)"

    if isinstance(payload, dict):
        for key in ("error", "message", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            # Some errors nest as {"error": {"message": "..."}}
            if isinstance(value, dict):
                inner = value.get("message")
                if isinstance(inner, str) and inner.strip():
                    return inner.strip()
    return str(payload)


def _cold_start_wait(response: httpx.Response) -> float:
    """
    Read how long HF says the model needs to load, for the 503 cold-start retry.

    Falls back to a modest default when the hint is missing, and is always capped so a
    request cannot hang for minutes.
    """
    try:
        payload = response.json()
        estimated = float(payload.get("estimated_time", 0.0))
    except Exception:
        estimated = 0.0

    if estimated <= 0:
        estimated = 5.0
    return min(estimated, config.MAX_COLD_START_WAIT_S)


async def post_image(
    client: httpx.AsyncClient,
    model_id: str,
    image_bytes: bytes,
    *,
    stage: str = "detect",
    parameters: dict | None = None,
) -> list[dict]:
    """
    POST a JPEG to a Hugging Face task model and return the parsed JSON list.

    Used for both object-detection and image-segmentation, which share this wire format.
    The image is sent as RAW BYTES (the API accepts raw bytes when no parameters are
    needed, which avoids ~33% base64 overhead on every frame).

    Raises HFError with the real status and body on any failure.
    """
    url = f"{config.HF_INFERENCE_BASE}/{model_id}"
    headers = _auth_headers()

    if parameters:
        # Parameters require the JSON envelope, which in turn requires base64.
        headers["Content-Type"] = "application/json"
        request_kwargs = {
            "json": {
                "inputs": base64.b64encode(image_bytes).decode("ascii"),
                "parameters": parameters,
            }
        }
    else:
        headers["Content-Type"] = "image/jpeg"
        request_kwargs = {"content": image_bytes}

    last_error: HFError | None = None

    # Attempt 0 is the real try; the rest are cold-start (503) retries.
    for attempt in range(config.MAX_COLD_START_RETRIES + 1):
        try:
            response = await client.post(url, headers=headers, **request_kwargs)
        except httpx.TimeoutException as exc:
            raise HFError(
                f"Request to {model_id} timed out after "
                f"{config.REQUEST_TIMEOUT_S:.0f}s: {exc}",
                status=None,
                model=model_id,
                stage=stage,
            ) from exc
        except httpx.HTTPError as exc:
            raise HFError(
                f"Network error calling {model_id}: {exc}",
                status=None,
                model=model_id,
                stage=stage,
            ) from exc

        if response.status_code == 200:
            try:
                payload = response.json()
            except Exception as exc:
                raise HFError(
                    f"{model_id} returned HTTP 200 but the body was not valid JSON: "
                    f"{response.text[:400]}",
                    status=200,
                    model=model_id,
                    stage=stage,
                ) from exc

            # Both tasks return a JSON array. Anything else means the model's output
            # format is not what this code path expects — surface that honestly.
            if not isinstance(payload, list):
                raise HFError(
                    f"{model_id} returned unexpected JSON (expected a list, got "
                    f"{type(payload).__name__}): {str(payload)[:400]}",
                    status=200,
                    model=model_id,
                    stage=stage,
                )
            return payload

        # 503 = model is loading. This is the one status worth waiting out.
        if response.status_code == 503 and attempt < config.MAX_COLD_START_RETRIES:
            wait_s = _cold_start_wait(response)
            print(
                f"[hf_client] {model_id} is cold (503). Waiting {wait_s:.1f}s then "
                f"retrying (attempt {attempt + 2}/{config.MAX_COLD_START_RETRIES + 1})..."
            )
            await asyncio.sleep(wait_s)
            last_error = HFError(
                _extract_error_body(response),
                status=503,
                model=model_id,
                stage=stage,
            )
            continue

        # Any other status is a real failure and is passed straight through.
        raise HFError(
            _extract_error_body(response),
            status=response.status_code,
            model=model_id,
            stage=stage,
        )

    # Retries exhausted on repeated 503s.
    assert last_error is not None
    raise last_error


async def chat_vlm(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    prompt_terms: list[str],
) -> str:
    """
    Ask a vision-language model to locate arbitrary objects, and return its raw text reply.

    This is the zero-shot path: unlike DETR's fixed 80 COCO classes, the model finds
    whatever you can name. It goes through the OpenAI-compatible chat completions route
    rather than the task-model route, because the model is served as a chat model.

    Returns the RAW text. Parsing lives in vision.py so a parse failure can be reported as
    a real, distinct error instead of being silently swallowed into an empty result.
    """
    headers = _auth_headers()
    headers["Content-Type"] = "application/json"

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    targets = ", ".join(prompt_terms) if prompt_terms else "every distinct object"

    # Qwen3-VL is trained for grounding and emits bbox_2d natively. The instruction pins
    # the output to bare JSON so parsing stays predictable.
    instruction = (
        f"Detect and locate the following in this image: {targets}.\n\n"
        "Respond with ONLY a JSON array, no prose and no markdown fences. Each element "
        'must be {"bbox_2d": [x1, y1, x2, y2], "label": "<name>"} where the coordinates '
        "are the top-left and bottom-right corners.\n"
        "Include one entry per distinct instance you actually see. "
        "If none are present, respond with exactly []."
    )

    payload = {
        "model": config.VLM_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {"type": "text", "text": instruction},
                ],
            }
        ],
        # Deterministic output: we want the same boxes for the same frame, not creativity.
        "temperature": 0,
        "max_tokens": 1024,
    }

    try:
        response = await client.post(
            config.CHAT_COMPLETIONS_URL, headers=headers, json=payload
        )
    except httpx.TimeoutException as exc:
        raise HFError(
            f"Request to {config.VLM_MODEL} timed out after "
            f"{config.REQUEST_TIMEOUT_S:.0f}s: {exc}",
            status=None,
            model=config.VLM_MODEL,
            stage="detect",
        ) from exc
    except httpx.HTTPError as exc:
        raise HFError(
            f"Network error calling {config.VLM_MODEL}: {exc}",
            status=None,
            model=config.VLM_MODEL,
            stage="detect",
        ) from exc

    if response.status_code != 200:
        raise HFError(
            _extract_error_body(response),
            status=response.status_code,
            model=config.VLM_MODEL,
            stage="detect",
        )

    try:
        payload = response.json()
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HFError(
            f"{config.VLM_MODEL} returned an unexpected chat response shape: "
            f"{response.text[:400]}",
            status=200,
            model=config.VLM_MODEL,
            stage="detect",
        ) from exc


async def health_check(client: httpx.AsyncClient, image_bytes: bytes) -> list[dict]:
    """
    Make one REAL call to the detection model to validate the token at startup.

    Deliberately uses the real endpoint rather than a metadata ping, so problems with the
    token's permissions or credit balance surface immediately instead of on first use.
    """
    return await post_image(
        client,
        config.DETECTION_MODEL,
        image_bytes,
        stage="detect",
    )
