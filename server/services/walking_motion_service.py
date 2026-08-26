from __future__ import annotations

import asyncio
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from imageio_ffmpeg import get_ffmpeg_exe

from services.character_assets import AssetSettings
from services.character_generator import CharacterGeneratorError
from services.walking_video_frames import build_walking_motion_pack
from services.video_generation import (
    DEFAULT_VIDEO_MODEL,
    UPSTREAM_VIDEO_MODEL_ID,
    append_generation_record,
    generate_walking_video,
)


PROMPT_VERSION = "video-walking-v1-identity-lock"
SOURCE_FPS = 24
PLAYBACK_FPS = 15
MIN_CYCLE_FRAMES = 15
MAX_CYCLE_FRAMES = 30
_generation_locks: dict[str, asyncio.Lock] = {}


def _safe_character_id(character_id: str) -> str:
    if not re.fullmatch(r"char_[A-Za-z0-9_-]{4,64}", character_id):
        raise CharacterGeneratorError(
            "invalid_character_id",
            "角色编号无效",
            retryable=False,
            status_code=422,
        )
    return character_id


def build_formal_walking_prompt(character_id: str) -> str:
    return (
        "Keep exactly the same single character identity, facial features, hairstyle, hair color, "
        "skin tone, outfit, clothing pattern, shoes, body proportions and illustration style as the reference. "
        "Keep a neutral stable facial expression, mouth closed and eyes looking forward. Avoid blinking and "
        "facial expression changes. Full-body cartoon character, centered, fixed camera and locked framing. "
        "The character performs a steady natural treadmill-style walk in place for the entire shot, not jogging "
        "or running. Left and right legs alternate continuously, knees bend naturally, feet contact and pass "
        "naturally, arms swing continuously in opposition to the legs, and body weight shifts smoothly with a "
        "subtle natural vertical motion. Keep the head and torso stable. Do not travel horizontally. Do not "
        "redesign the character, change clothes, patterns, hairstyle, shoes, age, body shape or art style. "
        "No extra person, extra limb, missing limb, text or watermark. Keep the whole body, both hands and both "
        "feet visible at all times. Simple clean solid background. No camera zoom, pan, tilt, roll, rotation or cut."
    )


def _next_call_index(log_path: Path) -> int:
    if not log_path.is_file():
        return 1
    try:
        entries = json.loads(log_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return 1
    indexes = [entry.get("call_index") for entry in entries if isinstance(entry, dict)]
    valid = [value for value in indexes if isinstance(value, int)]
    return max(valid, default=0) + 1


def _probe_video(ffmpeg_path: str, source_video: Path) -> dict[str, float | int]:
    result = subprocess.run(
        [ffmpeg_path, "-hide_banner", "-i", str(source_video)],
        capture_output=True,
        text=True,
        check=False,
    )
    output = result.stderr
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output)
    video_match = re.search(r"Video:.*?(\d{2,5})x(\d{2,5}).*?(\d+(?:\.\d+)?)\s*fps", output)
    if not duration_match or not video_match:
        raise RuntimeError("Unable to probe generated walking video metadata")
    hours, minutes, seconds = duration_match.groups()
    return {
        "duration": int(hours) * 3600 + int(minutes) * 60 + float(seconds),
        "width": int(video_match.group(1)),
        "height": int(video_match.group(2)),
        "fps": float(video_match.group(3)),
    }


def _extract_candidates(ffmpeg_path: str, source_video: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.glob("frame_*.png"):
        path.unlink()
    subprocess.run([
        ffmpeg_path,
        "-hide_banner", "-loglevel", "error",
        "-i", str(source_video),
        "-vf", f"fps={SOURCE_FPS}",
        "-y", str(output_dir / "frame_%03d.png"),
    ], check=True)
    frames = sorted(output_dir.glob("frame_*.png"))
    if len(frames) < MIN_CYCLE_FRAMES + 2:
        raise RuntimeError("Generated video does not contain enough frames for a walking cycle")
    return frames


def _frame_feature(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        rgb = image.convert("RGB")
    pixels = np.asarray(rgb, dtype=np.float32) / 255.0
    corners = np.concatenate([
        pixels[:12, :12].reshape(-1, 3),
        pixels[:12, -12:].reshape(-1, 3),
        pixels[-12:, :12].reshape(-1, 3),
        pixels[-12:, -12:].reshape(-1, 3),
    ])
    background = np.median(corners, axis=0)
    foreground = np.max(np.abs(pixels - background), axis=2) > 0.055
    ys, xs = np.where(foreground)
    if len(xs) > 0:
        padding = 8
        left = max(0, int(xs.min()) - padding)
        right = min(rgb.width, int(xs.max()) + padding + 1)
        top = max(0, int(ys.min()) - padding)
        bottom = min(rgb.height, int(ys.max()) + padding + 1)
        rgb = rgb.crop((left, top, right, bottom))
    resized = rgb.resize((96, 96), Image.Resampling.BILINEAR)
    return np.asarray(resized, dtype=np.float32) / 255.0


def choose_cycle(frames: list[Path]) -> tuple[int, int]:
    """Return 1-based start and end-exclusive frames with a visually similar seam."""
    features = [_frame_feature(path) for path in frames]
    best: tuple[float, int, int] | None = None
    first_allowed = min(8, max(0, len(frames) // 8))
    last_allowed = len(frames) - 3
    for start in range(first_allowed, last_allowed):
        for length in range(MIN_CYCLE_FRAMES, MAX_CYCLE_FRAMES + 1):
            end = start + length
            if end >= last_allowed:
                break
            seam = float(np.mean(np.abs(features[start] - features[end])))
            adjacent_motion = float(np.mean(np.abs(features[start] - features[start + 1])))
            if adjacent_motion < 0.002:
                continue
            score = seam + abs(length - 20) * 0.00015
            if best is None or score < best[0]:
                best = (score, start, end)
    if best is None:
        raise RuntimeError("Unable to find a usable walking cycle")
    _score, start, end = best
    return start + 1, end + 1


def _motion_payload(
    *,
    character_id: str,
    record,
    manifest,
    source_metadata: dict[str, float | int],
    public_base_url: str,
) -> dict[str, object]:
    now = datetime.now(timezone.utc).isoformat()
    root = f"{public_base_url.rstrip('/')}/generated/motions/{character_id}/walking"
    frames = [
        {
            "frameIndex": index,
            "sourceFrameIndex": manifest.source_start_frame + index,
            "imageUrl": url,
            "format": "png",
            "width": 768,
            "height": 768,
        }
        for index, url in enumerate(manifest.frame_urls)
    ]
    return {
        "version": "video-walking-v1",
        "status": "completed",
        "frames": frames,
        "frameCount": len(frames),
        "playbackFps": PLAYBACK_FPS,
        "frameDurationMs": 1000 / PLAYBACK_FPS,
        "source": {
            "provider": record.provider,
            "modelName": record.provider_model,
            "modelId": record.upstream_model_id,
            "sourceVideoUrl": f"{root}/source/walking_source_{record.call_index:02d}.mp4",
            "sourceVideoDurationSec": source_metadata["duration"],
            "sourceVideoFps": source_metadata["fps"],
            "sourceVideoWidth": source_metadata["width"],
            "sourceVideoHeight": source_metadata["height"],
            "cycleStartFrame": manifest.source_start_frame,
            "cycleEndFrame": manifest.source_end_frame_exclusive - 1,
            "taskId": record.task_id,
            "callIndex": record.call_index,
        },
        "promptVersion": PROMPT_VERSION,
        "createdAt": now,
        "updatedAt": now,
    }


async def generate_formal_walking_motion(character_id: str) -> dict[str, object]:
    safe_id = _safe_character_id(character_id)
    lock = _generation_locks.setdefault(safe_id, asyncio.Lock())
    if lock.locked():
        raise CharacterGeneratorError(
            "walking_generation_in_progress",
            "该角色的真实行走正在生成中",
            retryable=False,
            status_code=409,
        )

    async with lock:
        settings = AssetSettings.from_environment()
        master_path = settings.output_dir / f"{safe_id}_normalized.png"
        if not master_path.is_file():
            raise CharacterGeneratorError(
                "master_character_not_found",
                "没有找到当前角色的 normalizedImage",
                retryable=False,
                status_code=404,
            )
        output_root = settings.output_dir.parent / "motions" / safe_id / "walking"
        log_path = output_root / "generation_log.json"
        call_index = _next_call_index(log_path)
        source_path = output_root / "source" / f"walking_source_{call_index:02d}.mp4"
        prompt = build_formal_walking_prompt(safe_id)
        try:
            record = await generate_walking_video(
                master_path=master_path,
                output_path=source_path,
                call_index=call_index,
                model=DEFAULT_VIDEO_MODEL,
                prompt=prompt,
            )
            append_generation_record(record, log_path)
            ffmpeg_path = get_ffmpeg_exe()
            source_metadata = await asyncio.to_thread(_probe_video, ffmpeg_path, source_path)
            candidates = await asyncio.to_thread(
                _extract_candidates,
                ffmpeg_path,
                source_path,
                output_root / "candidates" / f"source_{call_index:02d}_{SOURCE_FPS}fps",
            )
            start_frame, end_frame_exclusive = await asyncio.to_thread(choose_cycle, candidates)
            manifest = await asyncio.to_thread(
                build_walking_motion_pack,
                ffmpeg_path=ffmpeg_path,
                character_id=safe_id,
                source_video=source_path,
                source_call_index=call_index,
                source_fps=SOURCE_FPS,
                start_frame=start_frame,
                end_frame_exclusive=end_frame_exclusive,
                output_root=output_root,
                legacy_sources=[],
                public_base_url=settings.public_base_url,
                rembg_model=settings.rembg_model,
            )
            motion = _motion_payload(
                character_id=safe_id,
                record=record,
                manifest=manifest,
                source_metadata=source_metadata,
                public_base_url=settings.public_base_url,
            )
            (output_root / "motion.json").write_text(
                json.dumps(motion, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return {"characterId": safe_id, "motion": motion}
        except CharacterGeneratorError:
            raise
        except Exception as error:
            raise CharacterGeneratorError(
                "walking_processing_failed",
                f"真实行走视频已保存，但 Motion Pack 处理失败：{error}",
                retryable=True,
                status_code=500,
            ) from error
