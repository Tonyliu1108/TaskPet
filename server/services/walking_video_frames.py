from __future__ import annotations

import io
import json
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Callable

from PIL import Image

from services.character_assets import (
    ALPHA_PADDING_PX,
    ALPHA_THRESHOLD,
    DEFAULT_CANVAS_SIZE,
    FOOT_BASELINE_RATIO,
    PERSON_MAX_HEIGHT_RATIO,
    PERSON_MAX_WIDTH_RATIO,
    alpha_content_bbox,
    remove_background_png,
)


@dataclass(frozen=True)
class WalkingCycleManifest:
    character_id: str
    source_video: str
    source_call_index: int
    source_fps: int
    source_start_frame: int
    source_end_frame_exclusive: int
    frame_count: int
    cycle_duration_seconds: float
    frame_urls: list[str]
    legacy_frame_urls: list[str]
    supported_playback_fps: list[int]
    preserves_vertical_motion: bool
    created_at: str


def manifest_public_dict(manifest: WalkingCycleManifest, *, public_root: str) -> dict[str, object]:
    return {
        "characterId": manifest.character_id,
        "sourceVideoUrl": f"{public_root}/source/walking_source_{manifest.source_call_index:02d}.mp4",
        "sourceVideoPath": manifest.source_video,
        "sourceCallIndex": manifest.source_call_index,
        "sourceFps": manifest.source_fps,
        "sourceStartFrame": manifest.source_start_frame,
        "sourceEndFrameExclusive": manifest.source_end_frame_exclusive,
        "frameCount": manifest.frame_count,
        "frameDurationMs": round(1000 / 15, 3),
        "cycleDurationSeconds": manifest.cycle_duration_seconds,
        "frames": manifest.frame_urls,
        "legacyFrames": manifest.legacy_frame_urls,
        "supportedPlaybackFps": manifest.supported_playback_fps,
        "preservesVerticalMotion": manifest.preserves_vertical_motion,
        "createdAt": manifest.created_at,
    }


def normalize_walking_sequence(
    transparent_frames: list[bytes],
    *,
    canvas_size: int = DEFAULT_CANVAS_SIZE,
) -> list[bytes]:
    """Normalize a fixed-camera sequence without locking every foot to one baseline."""
    images: list[Image.Image] = []
    bboxes: list[tuple[int, int, int, int]] = []
    for payload in transparent_frames:
        with Image.open(io.BytesIO(payload)) as source:
            image = source.convert("RGBA")
        bbox = alpha_content_bbox(image, threshold=ALPHA_THRESHOLD, padding=ALPHA_PADDING_PX)
        if bbox is None:
            raise ValueError("Walking frame has no visible alpha content")
        images.append(image)
        bboxes.append(bbox)

    max_width = max(right - left for left, _top, right, _bottom in bboxes)
    max_height = max(bottom - top for _left, top, _right, bottom in bboxes)
    scale = min(
        canvas_size * PERSON_MAX_WIDTH_RATIO / max_width,
        canvas_size * PERSON_MAX_HEIGHT_RATIO / max_height,
    )
    median_center_x = median((left + right) / 2 for left, _top, right, _bottom in bboxes)
    median_bottom = median(bottom for _left, _top, _right, bottom in bboxes)
    origin_x = round(canvas_size / 2 - median_center_x * scale)
    origin_y = round(canvas_size * FOOT_BASELINE_RATIO - median_bottom * scale)

    normalized: list[bytes] = []
    for image in images:
        target_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        resized = image.resize(target_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        canvas.alpha_composite(resized, dest=(origin_x, origin_y))
        output = io.BytesIO()
        canvas.save(output, format="PNG", optimize=True)
        normalized.append(output.getvalue())
    return normalized


def extract_cycle_frames(
    *,
    ffmpeg_path: str,
    source_video: Path,
    output_dir: Path,
    source_fps: int,
    start_frame: int,
    end_frame_exclusive: int,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    for existing in output_dir.glob("frame_*.png"):
        existing.unlink()
    start_seconds = (start_frame - 1) / source_fps
    frame_count = end_frame_exclusive - start_frame
    command = [
        ffmpeg_path,
        "-hide_banner", "-loglevel", "error",
        "-ss", f"{start_seconds:.9f}",
        "-i", str(source_video),
        "-vf", f"fps={source_fps}",
        "-frames:v", str(frame_count),
        "-y", str(output_dir / "frame_%03d.png"),
    ]
    subprocess.run(command, check=True)
    frames = sorted(output_dir.glob("frame_*.png"))
    if len(frames) != frame_count:
        raise RuntimeError(f"Expected {frame_count} extracted frames, got {len(frames)}")
    return frames


def build_walking_motion_pack(
    *,
    ffmpeg_path: str,
    character_id: str,
    source_video: Path,
    source_call_index: int,
    source_fps: int,
    start_frame: int,
    end_frame_exclusive: int,
    output_root: Path,
    legacy_sources: list[Path],
    public_base_url: str,
    rembg_model: str = "isnet-anime",
    background_remover: Callable[[bytes, str], bytes] = remove_background_png,
) -> WalkingCycleManifest:
    raw_dir = output_root / "frames" / "raw"
    transparent_dir = output_root / "frames" / "transparent"
    normalized_dir = output_root / "frames" / "normalized"
    legacy_dir = output_root / "legacy_8frame"
    source_frames = extract_cycle_frames(
        ffmpeg_path=ffmpeg_path,
        source_video=source_video,
        output_dir=raw_dir,
        source_fps=source_fps,
        start_frame=start_frame,
        end_frame_exclusive=end_frame_exclusive,
    )

    transparent_dir.mkdir(parents=True, exist_ok=True)
    transparent_payloads: list[bytes] = []
    for index, source_path in enumerate(source_frames, start=1):
        payload = background_remover(source_path.read_bytes(), rembg_model)
        transparent_payloads.append(payload)
        (transparent_dir / f"frame_{index:03d}.png").write_bytes(payload)

    normalized_payloads = normalize_walking_sequence(transparent_payloads)
    normalized_dir.mkdir(parents=True, exist_ok=True)
    for index, payload in enumerate(normalized_payloads, start=1):
        (normalized_dir / f"frame_{index:03d}.png").write_bytes(payload)

    legacy_dir.mkdir(parents=True, exist_ok=True)
    for index, source_path in enumerate(legacy_sources, start=1):
        shutil.copy2(source_path, legacy_dir / f"frame_{index:03d}.png")

    public_root = f"{public_base_url.rstrip('/')}/generated/motions/{character_id}/walking"
    frame_urls = [f"{public_root}/frames/normalized/frame_{index:03d}.png" for index in range(1, len(normalized_payloads) + 1)]
    legacy_frame_urls = [f"{public_root}/legacy_8frame/frame_{index:03d}.png" for index in range(1, len(legacy_sources) + 1)]
    manifest = WalkingCycleManifest(
        character_id=character_id,
        source_video=str(source_video),
        source_call_index=source_call_index,
        source_fps=source_fps,
        source_start_frame=start_frame,
        source_end_frame_exclusive=end_frame_exclusive,
        frame_count=len(normalized_payloads),
        cycle_duration_seconds=round(len(normalized_payloads) / source_fps, 4),
        frame_urls=frame_urls,
        legacy_frame_urls=legacy_frame_urls,
        supported_playback_fps=[12, 15, 18],
        preserves_vertical_motion=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    (output_root / "manifest.json").write_text(
        json.dumps(manifest_public_dict(manifest, public_root=public_root), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest
