import base64
import binascii
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from services.character_assets import CharacterAssetError, process_character_assets


PROMPT_VERSION = "seedream-character-v2-transparent-pet"
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_MODEL_LABEL = "Seedream 5.0 Lite"
MODEL_ALIASES = {
    "seedream 5.0 lite": "doubao-seedream-5-0-lite-260128",
    "doubao-seedream-5.0-lite": "doubao-seedream-5-0-lite-260128",
}


class CharacterGeneratorError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool, status_code: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.status_code = status_code

    def as_detail(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }


@dataclass(frozen=True)
class ArkSettings:
    api_key: str
    api_style: str
    configured_model: str
    request_model: str
    base_url: str
    timeout_seconds: float

    @classmethod
    def from_environment(cls) -> "ArkSettings":
        configured_model = os.getenv("ARK_IMAGE_MODEL", DEFAULT_MODEL_LABEL).strip() or DEFAULT_MODEL_LABEL
        base_url = (os.getenv("ARK_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL).rstrip("/")
        configured_style = os.getenv("ARK_API_STYLE", "auto").strip().lower()
        if configured_style not in {"auto", "official", "relay"}:
            configured_style = "auto"
        api_style = configured_style
        if api_style == "auto":
            api_style = "official" if base_url == DEFAULT_BASE_URL else "relay"
        request_model = (
            MODEL_ALIASES.get(configured_model.lower(), configured_model)
            if api_style == "official"
            else configured_model
        )
        return cls(
            api_key=os.getenv("ARK_API_KEY", "").strip(),
            api_style=api_style,
            configured_model=configured_model,
            request_model=request_model,
            base_url=base_url,
            timeout_seconds=float(os.getenv("ARK_REQUEST_TIMEOUT_SECONDS", "120")),
        )

    @property
    def provider_name(self) -> str:
        return "seedream-relay" if self.api_style == "relay" else "volcano-ark-seedream"


@dataclass(frozen=True)
class SeedreamGeneration:
    source: str
    http_status: int
    request_id: Optional[str]


def _validate_data_url(image_data_url: str) -> None:
    try:
        _, encoded = image_data_url.split(",", 1)
        decoded = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise CharacterGeneratorError(
            "invalid_image",
            "人物裁剪图不是有效的 Base64 图片",
            retryable=False,
            status_code=422,
        ) from error

    if len(decoded) > 10 * 1024 * 1024:
        raise CharacterGeneratorError(
            "image_too_large",
            "人物裁剪图超过 10 MB，请更换照片",
            retryable=False,
            status_code=413,
        )


def _build_prompt(pet_name: str, personality: str, motion_style: str) -> str:
    personality_hint = {
        "calm": "姿态稳重、专业、克制",
        "friendly": "姿态轻快、友好、有亲和力",
        "direct": "姿态利落、简洁、自信",
        "funny": "姿态自然、轻松、带一点幽默感",
    }.get(personality, "姿态自然、友好")
    motion_hint = {
        "light": "动作感轻盈",
        "steady": "站姿沉稳",
        "cute": "比例可爱但不过度幼态",
        "robotic": "带少量现代科技感，但仍保持人类角色",
    }.get(motion_style, "站姿自然")

    return (
        "根据唯一一张参考人物图，将图中人物转换为高质量、简洁、友好的 2D 卡通全身人物主形象，"
        "用于网页办公 AI 桌宠。保持同一人物的主要可识别特征：发型轮廓、脸部整体印象、肤色、"
        "服装主色和体型印象。角色完整显示头、身体、双手和双脚，正面或近正面单独站立，"
        f"{personality_hint}，{motion_hint}。人物轮廓清晰，头发、手臂、手指和脚部边缘完整，"
        "采用稍远的全身构图，从头顶到双脚及鞋底全部完整入镜，头顶、左右手和脚底四周都保留"
        "至少 12% 的纯色安全留白，任何身体部位不得贴边或超出画布。与干净的纯浅色背景保持"
        "明确分离，便于制作透明桌面角色资产。"
        "不要添加其他人物、宠物、道具、复杂场景、边框、文字、签名、品牌标志或水印。"
        f"角色名字是“{pet_name}”，但不要把名字画在图片里。只输出一张完整人物图。"
    )


def _extract_image(response_json: dict[str, Any]) -> str:
    data = response_json.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise CharacterGeneratorError(
            "invalid_provider_response",
            "豆包没有返回可用图片，请重试",
            retryable=True,
        )

    item = data[0]
    image_url = item.get("url")
    if isinstance(image_url, str) and image_url.startswith(("https://", "http://")):
        return image_url

    b64_json = item.get("b64_json")
    if isinstance(b64_json, str) and b64_json:
        return f"data:image/png;base64,{b64_json}"

    raise CharacterGeneratorError(
        "invalid_provider_response",
        "豆包返回结果中没有图片数据，请重试",
        retryable=True,
    )


def build_seedream_payload(
    settings: ArkSettings,
    *,
    prompt: str,
    reference_image: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": settings.request_model,
        "prompt": prompt,
        "image": [reference_image],
        "watermark": False,
    }
    if settings.api_style == "relay":
        payload.update({
            "n": 1,
            "size": "2k",
            "output_format": "png",
        })
    else:
        payload.update({
            "size": "2K",
            "sequential_image_generation": "disabled",
            "response_format": "url",
        })
    return payload


async def request_seedream_image(
    settings: ArkSettings,
    *,
    prompt: str,
    reference_image: str,
) -> SeedreamGeneration:
    payload = build_seedream_payload(
        settings,
        prompt=prompt,
        reference_image=reference_image,
    )

    try:
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            response = await client.post(
                f"{settings.base_url}/images/generations",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException as error:
        raise CharacterGeneratorError(
            "ark_timeout",
            "豆包生成超时，请稍后重试",
            retryable=True,
            status_code=504,
        ) from error
    except httpx.RequestError as error:
        raise CharacterGeneratorError(
            "ark_network_error",
            "无法连接豆包图片生成服务，请检查网络后重试",
            retryable=True,
            status_code=502,
        ) from error

    request_id = response.headers.get("x-request-id") or response.headers.get("x-tt-logid")
    if response.is_error:
        provider_label = "图片中转站" if settings.api_style == "relay" else "火山方舟"
        message = "豆包图片生成失败，请检查 API Key、模型权限和模型配置"
        if response.status_code == 401:
            message = f"{provider_label}鉴权失败，请检查 ARK_API_KEY"
        elif response.status_code == 429:
            message = "豆包请求过于频繁或额度不足，请稍后重试"
        elif response.status_code == 400:
            message = f"当前 ARK_IMAGE_MODEL 或图片参数不被{provider_label}接受"
        elif response.status_code >= 500:
            message = f"{provider_label}暂时不可用（HTTP {response.status_code}），请稍后重试"
        if request_id:
            message = f"{message}（请求 ID：{request_id}）"
        raise CharacterGeneratorError(
            "ark_api_error",
            message,
            retryable=True,
            status_code=502,
        )

    try:
        response_json = response.json()
    except ValueError as error:
        raise CharacterGeneratorError(
            "invalid_provider_response",
            "豆包返回了无法解析的响应",
            retryable=True,
        ) from error

    return SeedreamGeneration(
        source=_extract_image(response_json),
        http_status=response.status_code,
        request_id=request_id,
    )


async def generate_character(
    *,
    image_data_url: str,
    pet_name: str,
    personality: str,
    motion_style: str,
) -> dict[str, str]:
    _validate_data_url(image_data_url)
    settings = ArkSettings.from_environment()
    if not settings.api_key:
        raise CharacterGeneratorError(
            "ark_not_configured",
            "豆包图片生成尚未配置 ARK_API_KEY",
            retryable=True,
            status_code=503,
        )

    provider_result = await request_seedream_image(
        settings,
        prompt=_build_prompt(pet_name, personality, motion_style),
        reference_image=image_data_url,
    )
    character_id = f"char_{uuid.uuid4().hex[:16]}"
    try:
        assets = await process_character_assets(
            base_source=provider_result.source,
            character_id=character_id,
        )
    except CharacterAssetError as error:
        raise CharacterGeneratorError(
            error.code,
            error.message,
            retryable=error.retryable,
            status_code=error.status_code,
        ) from error

    return {
        "characterId": character_id,
        **assets,
        "modelName": settings.configured_model,
        "promptVersion": PROMPT_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
