from __future__ import annotations

import asyncio
import base64
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from services.character_generator import ArkSettings, CharacterGeneratorError


DEFAULT_TEST_CHARACTER_ID = "char_test_video"
DEFAULT_VIDEO_MODEL = "Doubao-Seedance-2.0-fast"
UPSTREAM_VIDEO_MODEL_ID = "doubao-seedance-2-0-fast-260128"
VIDEO_ENDPOINT = "/video/generations"
VIDEO_CONTENT_ENDPOINT = "/videos/{task_id}/content"
PROVIDER_MINIMUM_DURATION_SECONDS = 4
POLL_INTERVAL_SECONDS = 10
POLL_TIMEOUT_SECONDS = 15 * 60

WALKING_VIDEO_PROMPT = (
    "Keep exactly the same single 2D cartoon character identity, face, hairstyle, hair color, "
    "skin tone, clothing, footwear, body proportions and illustration style as the reference image. "
    "Full-body character, centered, fixed camera and locked framing. The character performs "
    "a steady natural treadmill-style walk in place for the entire shot, not jogging or "
    "running. Begin immediately in a stable repeating gait cycle and finish in the same "
    "left-foot-contact pose: left and right legs "
    "alternate continuously, knees bend naturally, feet contact and pass naturally, arms "
    "swing continuously in opposition to the legs, and body weight shifts smoothly with a "
    "subtle vertical motion. Keep the original expression and keep the head and torso stable. "
    "Preserve every visual detail from the reference. Do not travel horizontally. "
    "Do not redesign the character, change the face, clothes, hairstyle, shoes, age, body "
    "shape or art style. No extra person, extra limb, missing limb, text or watermark. "
    "Keep the whole body, both hands and both feet visible at all times. Simple clean solid "
    "background. No camera zoom, pan, tilt, roll, rotation or cut. Seamless steady motion."
)


@dataclass(frozen=True)
class VideoGenerationRecord:
    call_index: int
    provider: str
    provider_model: str
    upstream_model_id: str
    endpoint: str
    task_id: str
    submitted_at: str
    completed_at: str
    elapsed_seconds: float
    requested_duration_seconds: int
    final_status: str
    source_video_path: str
    prompt: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reference_data_url(master_path: Path) -> str:
    if not master_path.is_file():
        raise FileNotFoundError(f"Master normalizedImage not found: {master_path}")
    encoded = base64.b64encode(master_path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_video_payload(*, model: str, reference_image: str, prompt: str) -> dict[str, Any]:
    return {
        "model": model,
        "prompt": prompt,
        "image": reference_image,
        "duration": PROVIDER_MINIMUM_DURATION_SECONDS,
        "metadata": {
            "duration": PROVIDER_MINIMUM_DURATION_SECONDS,
            "ratio": "1:1",
            "resolution": "720p",
            "watermark": False,
            "generate_audio": False,
        },
    }


def _provider_error(response: httpx.Response, action: str) -> CharacterGeneratorError:
    request_id = response.headers.get("x-oneapi-request-id") or response.headers.get("x-request-id")
    detail = response.text[:800]
    suffix = f" request_id={request_id}" if request_id else ""
    return CharacterGeneratorError(
        "video_provider_error",
        f"Walking video {action} failed with HTTP {response.status_code}.{suffix} {detail}",
        retryable=response.status_code >= 429,
        status_code=502,
    )


def _extract_task_id(payload: dict[str, Any]) -> str:
    task_id = payload.get("task_id") or payload.get("id")
    if not isinstance(task_id, str) or not task_id:
        raise CharacterGeneratorError(
            "invalid_video_response",
            "Video provider did not return a task ID",
            retryable=True,
            status_code=502,
        )
    return task_id


def _unwrap_task(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


async def generate_walking_video(
    *,
    master_path: Path,
    output_path: Path,
    call_index: int,
    model: str = DEFAULT_VIDEO_MODEL,
    prompt: str = WALKING_VIDEO_PROMPT,
) -> VideoGenerationRecord:
    settings = ArkSettings.from_environment()
    if settings.api_style != "relay":
        raise CharacterGeneratorError(
            "video_compatible_endpoint_required",
            "Video generation requires a compatible configured endpoint",
            retryable=False,
            status_code=503,
        )
    if not settings.api_key:
        raise CharacterGeneratorError(
            "ark_not_configured",
            "ARK_API_KEY is not configured",
            retryable=False,
            status_code=503,
        )

    endpoint = f"{settings.base_url}{VIDEO_ENDPOINT}"
    submitted_at = _utc_now()
    started = time.perf_counter()
    timeout = httpx.Timeout(60.0, read=180.0)
    headers = {
        "Authorization": f"Bearer {settings.api_key}",
        "Content-Type": "application/json",
    }
    payload = build_video_payload(
        model=model,
        reference_image=_reference_data_url(master_path),
        prompt=prompt,
    )

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.post(endpoint, headers=headers, json=payload)
        if response.is_error:
            raise _provider_error(response, "submission")
        try:
            task_id = _extract_task_id(response.json())
        except ValueError as error:
            raise CharacterGeneratorError(
                "invalid_video_response",
                "Video provider returned invalid JSON on submission",
                retryable=True,
                status_code=502,
            ) from error

        final_status = "queued"
        deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            poll_response = await client.get(f"{endpoint}/{task_id}", headers=headers)
            if poll_response.is_error:
                raise _provider_error(poll_response, "poll")
            try:
                task = _unwrap_task(poll_response.json())
            except ValueError as error:
                raise CharacterGeneratorError(
                    "invalid_video_response",
                    "Video provider returned invalid JSON while polling",
                    retryable=True,
                    status_code=502,
                ) from error
            final_status = str(task.get("status") or "unknown").lower()
            if final_status in {"succeeded", "completed", "success"}:
                break
            if final_status in {"failed", "failure", "cancelled", "canceled"}:
                reason = task.get("fail_reason") or task.get("error") or "unknown provider failure"
                raise CharacterGeneratorError(
                    "video_generation_failed",
                    f"Walking video task failed: {reason}",
                    retryable=True,
                    status_code=502,
                )
        else:
            raise CharacterGeneratorError(
                "video_generation_timeout",
                "Walking video task did not finish within 15 minutes",
                retryable=True,
                status_code=504,
            )

        content_url = f"{settings.base_url}{VIDEO_CONTENT_ENDPOINT.format(task_id=task_id)}"
        video_response = await client.get(content_url, headers={"Authorization": f"Bearer {settings.api_key}"})
        if video_response.is_error:
            raise _provider_error(video_response, "download")
        if not video_response.content:
            raise CharacterGeneratorError(
                "empty_video",
                "Video provider returned an empty video file",
                retryable=True,
                status_code=502,
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(".mp4.tmp")
    temporary_path.write_bytes(video_response.content)
    temporary_path.replace(output_path)
    completed_at = _utc_now()
    return VideoGenerationRecord(
        call_index=call_index,
        provider="OpenAI-compatible video provider",
        provider_model=model,
        upstream_model_id=UPSTREAM_VIDEO_MODEL_ID,
        endpoint=endpoint,
        task_id=task_id,
        submitted_at=submitted_at,
        completed_at=completed_at,
        elapsed_seconds=round(time.perf_counter() - started, 2),
        requested_duration_seconds=PROVIDER_MINIMUM_DURATION_SECONDS,
        final_status=final_status,
        source_video_path=str(output_path),
        prompt=prompt,
    )


def append_generation_record(record: VideoGenerationRecord | dict[str, Any], log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    if log_path.is_file():
        try:
            existing = json.loads(log_path.read_text(encoding="utf-8"))
            if isinstance(existing, list):
                entries = existing
        except (OSError, ValueError):
            entries = []
    entries.append(asdict(record) if isinstance(record, VideoGenerationRecord) else record)
    log_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
