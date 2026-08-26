import asyncio
import base64
import binascii
import io
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional, Tuple

import httpx
import numpy as np
from PIL import Image, UnidentifiedImageError
from scipy import ndimage


SERVER_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = SERVER_ROOT / "generated" / "characters"
DEFAULT_PUBLIC_BASE_URL = "http://127.0.0.1:8001"
DEFAULT_REMBG_MODEL = "isnet-anime"
DEFAULT_CANVAS_SIZE = 768
MAX_SOURCE_BYTES = 25 * 1024 * 1024
PERSON_MAX_HEIGHT_RATIO = 0.86
PERSON_MAX_WIDTH_RATIO = 0.88
FOOT_BASELINE_RATIO = 0.94
ALPHA_THRESHOLD = 8
ALPHA_PADDING_PX = 2
ALPHA_EDGE_DILATION_PX = 2


class CharacterAssetError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = True, status_code: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.status_code = status_code


@dataclass(frozen=True)
class AssetSettings:
    output_dir: Path
    public_base_url: str
    rembg_model: str
    canvas_size: int
    download_timeout_seconds: float

    @classmethod
    def from_environment(cls) -> "AssetSettings":
        configured_output = os.getenv("ASSET_OUTPUT_DIR", "").strip()
        output_dir = Path(configured_output).expanduser() if configured_output else DEFAULT_OUTPUT_DIR
        if not output_dir.is_absolute():
            output_dir = SERVER_ROOT / output_dir

        try:
            canvas_size = int(os.getenv("ASSET_CANVAS_SIZE", str(DEFAULT_CANVAS_SIZE)))
        except ValueError:
            canvas_size = DEFAULT_CANVAS_SIZE
        canvas_size = max(256, min(canvas_size, 2048))

        return cls(
            output_dir=output_dir,
            public_base_url=(
                os.getenv("ASSET_BASE_URL", DEFAULT_PUBLIC_BASE_URL).strip()
                or DEFAULT_PUBLIC_BASE_URL
            ).rstrip("/"),
            rembg_model=os.getenv("REMBG_MODEL", DEFAULT_REMBG_MODEL).strip() or DEFAULT_REMBG_MODEL,
            canvas_size=canvas_size,
            download_timeout_seconds=float(os.getenv("ASSET_DOWNLOAD_TIMEOUT_SECONDS", "45")),
        )


_rembg_sessions: dict[str, Any] = {}
_rembg_session_lock = threading.Lock()


def _safe_character_id(character_id: str) -> str:
    safe_id = "".join(character for character in character_id if character.isalnum() or character in {"-", "_"})
    if not safe_id or safe_id != character_id:
        raise CharacterAssetError(
            "asset_write_failed",
            "角色资产编号无效，无法保存透明角色",
            retryable=False,
            status_code=500,
        )
    return safe_id


def _decode_data_url(source: str) -> bytes:
    try:
        _, encoded = source.split(",", 1)
        return base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise CharacterAssetError(
            "base_image_download_failed",
            "AI 原始角色图不是有效的图片数据",
        ) from error


async def load_base_image_bytes(source: str, timeout_seconds: float) -> bytes:
    if source.startswith("data:image/"):
        payload = _decode_data_url(source)
    elif source.startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
                response = await client.get(source)
                response.raise_for_status()
                payload = response.content
        except (httpx.TimeoutException, httpx.RequestError, httpx.HTTPStatusError) as error:
            raise CharacterAssetError(
                "base_image_download_failed",
                "无法下载 AI 原始角色图，透明化尚未完成",
            ) from error
    else:
        raise CharacterAssetError(
            "base_image_download_failed",
            "AI 原始角色图地址无效，透明化尚未完成",
        )

    if not payload or len(payload) > MAX_SOURCE_BYTES:
        raise CharacterAssetError(
            "base_image_download_failed",
            "AI 原始角色图为空或超过 25 MB",
        )
    return payload


def ensure_png(image_bytes: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            source.load()
            image = source.convert("RGBA" if "A" in source.getbands() else "RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise CharacterAssetError(
            "base_image_download_failed",
            "AI 返回内容不是可读取的图片",
        ) from error

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _get_rembg_session(model_name: str) -> Any:
    with _rembg_session_lock:
        if model_name not in _rembg_sessions:
            from rembg import new_session

            _rembg_sessions[model_name] = new_session(model_name)
        return _rembg_sessions[model_name]


def _run_rembg(image_bytes: bytes, model_name: str) -> bytes:
    from rembg import remove

    return remove(image_bytes, session=_get_rembg_session(model_name))


def _validated_rgba_image(image_bytes: bytes, *, error_code: str, error_message: str) -> Image.Image:
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            source.load()
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError) as error:
        raise CharacterAssetError(error_code, error_message) from error

    alpha = image.getchannel("A")
    minimum_alpha, maximum_alpha = alpha.getextrema()
    if maximum_alpha == 0 or minimum_alpha == 255:
        raise CharacterAssetError(error_code, error_message)
    return image


def keep_primary_alpha_component(image: Image.Image) -> Image.Image:
    """Remove disconnected background remnants while preserving the real Alpha edge."""
    rgba = image.convert("RGBA")
    pixels = np.asarray(rgba).copy()
    alpha = pixels[:, :, 3]
    core_mask = alpha > ALPHA_THRESHOLD
    labels, component_count = ndimage.label(core_mask)
    if component_count == 0:
        raise CharacterAssetError(
            "transparent_asset_failed",
            "角色透明化失败，未识别到可用人物主体",
        )

    component_sizes = np.bincount(labels.ravel())
    component_sizes[0] = 0
    primary_label = int(component_sizes.argmax())
    primary_mask = labels == primary_label
    if int(component_sizes[primary_label]) < max(64, round(alpha.size * 0.001)):
        raise CharacterAssetError(
            "transparent_asset_failed",
            "角色透明化失败，人物主体区域过小",
        )

    edge_mask = ndimage.binary_dilation(primary_mask, iterations=ALPHA_EDGE_DILATION_PX)
    pixels[:, :, 3] = np.where(edge_mask, alpha, 0).astype(np.uint8)
    return Image.fromarray(pixels)


def remove_background_png(image_bytes: bytes, model_name: str) -> bytes:
    try:
        removed = _run_rembg(image_bytes, model_name)
    except CharacterAssetError:
        raise
    except Exception as error:
        raise CharacterAssetError(
            "transparent_asset_failed",
            "角色透明化失败，请重试或更换图片",
        ) from error

    transparent = _validated_rgba_image(
        removed,
        error_code="transparent_asset_failed",
        error_message="角色透明化失败，未得到有效 Alpha 通道",
    )
    transparent = keep_primary_alpha_component(transparent)
    output = io.BytesIO()
    transparent.save(output, format="PNG", optimize=True)
    return output.getvalue()


def alpha_content_bbox(
    image: Image.Image,
    threshold: int = ALPHA_THRESHOLD,
    padding: int = 0,
) -> Optional[Tuple[int, int, int, int]]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )


def normalize_transparent_png(image_bytes: bytes, canvas_size: int = DEFAULT_CANVAS_SIZE) -> bytes:
    image = _validated_rgba_image(
        image_bytes,
        error_code="normalization_failed",
        error_message="透明角色标准化失败，图片没有可用人物区域",
    )
    visible_bbox = alpha_content_bbox(image)
    if visible_bbox is None:
        raise CharacterAssetError(
            "normalization_failed",
            "透明角色标准化失败，图片没有可用人物区域",
        )

    crop_bbox = alpha_content_bbox(image, padding=ALPHA_PADDING_PX)
    if crop_bbox is None:
        raise CharacterAssetError(
            "normalization_failed",
            "透明角色标准化失败，图片没有可用人物区域",
        )
    character = image.crop(crop_bbox)
    visible_width = visible_bbox[2] - visible_bbox[0]
    visible_height = visible_bbox[3] - visible_bbox[1]
    max_width = round(canvas_size * PERSON_MAX_WIDTH_RATIO)
    max_height = round(canvas_size * PERSON_MAX_HEIGHT_RATIO)
    scale = min(max_width / visible_width, max_height / visible_height)
    target_width = max(1, round(character.width * scale))
    target_height = max(1, round(character.height * scale))
    resized = character.resize((target_width, target_height), Image.Resampling.LANCZOS)
    resized_bbox = alpha_content_bbox(resized, threshold=0)
    if resized_bbox is None:
        raise CharacterAssetError(
            "normalization_failed",
            "透明角色标准化失败，缩放后人物区域为空",
        )

    baseline = round(canvas_size * FOOT_BASELINE_RATIO)
    resized_center_x = (resized_bbox[0] + resized_bbox[2]) / 2
    target_x = round((canvas_size / 2) - resized_center_x)
    target_y = baseline - resized_bbox[3]
    if target_x < 0 or target_y < 0 or target_x + target_width > canvas_size or baseline > canvas_size:
        raise CharacterAssetError(
            "normalization_failed",
            "透明角色标准化失败，人物无法安全放入标准画布",
        )

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, dest=(target_x, target_y))
    output_bbox = alpha_content_bbox(canvas, threshold=0)
    if output_bbox is None or output_bbox[3] > baseline:
        raise CharacterAssetError(
            "normalization_failed",
            "透明角色标准化失败，脚底基线校验未通过",
        )

    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _write_assets(output_dir: Path, assets: dict[str, bytes]) -> None:
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        for name, payload in assets.items():
            target = output_dir / name
            temporary = target.with_suffix(f"{target.suffix}.tmp")
            temporary.write_bytes(payload)
            temporary.replace(target)
    except OSError as error:
        raise CharacterAssetError(
            "asset_write_failed",
            "角色资产文件写入失败，请检查后端目录权限",
            status_code=500,
        ) from error


async def process_character_assets(
    *,
    base_source: str,
    character_id: str,
    settings: Optional[AssetSettings] = None,
    background_remover: Callable[[bytes, str], bytes] = remove_background_png,
) -> dict[str, str]:
    settings = settings or AssetSettings.from_environment()
    safe_id = _safe_character_id(character_id)
    downloaded = await load_base_image_bytes(base_source, settings.download_timeout_seconds)
    base_png = await asyncio.to_thread(ensure_png, downloaded)
    transparent_png = await asyncio.to_thread(background_remover, base_png, settings.rembg_model)
    normalized_png = await asyncio.to_thread(
        normalize_transparent_png,
        transparent_png,
        settings.canvas_size,
    )

    names = {
        "baseImage": f"{safe_id}_base.png",
        "transparentImage": f"{safe_id}_transparent.png",
        "normalizedImage": f"{safe_id}_normalized.png",
    }
    await asyncio.to_thread(
        _write_assets,
        settings.output_dir,
        {
            names["baseImage"]: base_png,
            names["transparentImage"]: transparent_png,
            names["normalizedImage"]: normalized_png,
        },
    )
    public_prefix = f"{settings.public_base_url}/generated/{settings.output_dir.name}"
    return {field: f"{public_prefix}/{file_name}" for field, file_name in names.items()}
