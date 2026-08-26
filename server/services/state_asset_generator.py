import base64
import io
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, cast

from PIL import Image, UnidentifiedImageError

from services.character_assets import (
    AssetSettings,
    CharacterAssetError,
    process_character_assets,
)
from services.character_generator import (
    ArkSettings,
    CharacterGeneratorError,
    request_seedream_image,
)


PetVisualState = Literal[
    "idle",
    "walking",
    "thinking",
    "working",
    "waiting",
    "celebrating",
]

STATE_ASSET_PROMPT_VERSION = "seedream-state-v1-master-reference"
STATE_ACTION_PROMPTS: dict[PetVisualState, str] = {
    "idle": "自然放松地正面站立，双臂自然垂下，呈现安静待命状态，动作克制。",
    "walking": "呈现清晰的行走瞬间，一条腿自然向前迈步，另一条腿支撑，双臂轻微摆动。",
    "thinking": "呈现明显但自然的思考姿势，一只手轻托下巴，神情专注沉思。",
    "working": "呈现正在工作的姿势，手持一块小型平板或文件板进行查看，办公道具不能遮挡身体。",
    "waiting": "呈现等待用户回应的期待姿势，一只手轻轻抬起示意，表情耐心友好。",
    "celebrating": "呈现明显开心庆祝动作，双手向上抬起，神情喜悦，可有极少量小星星但不要背景场景。",
}


def _safe_character_id(character_id: str) -> str:
    safe_id = "".join(
        character for character in character_id
        if character.isalnum() or character in {"-", "_"}
    )
    if safe_id != character_id or not safe_id.startswith("char_"):
        raise CharacterGeneratorError(
            "invalid_character_id",
            "Master Character 编号无效",
            retryable=False,
            status_code=422,
        )
    return safe_id


def _master_path(character_id: str, settings: AssetSettings) -> Path:
    safe_id = _safe_character_id(character_id)
    return settings.output_dir / f"{safe_id}_normalized.png"


def _load_master_reference(character_id: str, settings: AssetSettings) -> tuple[str, str]:
    master_path = _master_path(character_id, settings)
    if not master_path.is_file():
        raise CharacterGeneratorError(
            "master_character_not_found",
            "没有找到当前 Master Character 的 normalizedImage",
            retryable=False,
            status_code=404,
        )

    try:
        payload = master_path.read_bytes()
        with Image.open(io.BytesIO(payload)) as image:
            image.load()
            if image.size != (settings.canvas_size, settings.canvas_size) or image.mode != "RGBA":
                raise ValueError("master character is not a normalized RGBA asset")
            minimum_alpha, maximum_alpha = image.getchannel("A").getextrema()
            if minimum_alpha == 255 or maximum_alpha == 0:
                raise ValueError("master character has no usable alpha content")
    except (OSError, UnidentifiedImageError, ValueError) as error:
        raise CharacterGeneratorError(
            "master_character_invalid",
            "当前 Master Character 不是有效的 768×768 透明标准角色",
            retryable=False,
            status_code=422,
        ) from error

    encoded = base64.b64encode(payload).decode("ascii")
    public_url = (
        f"{settings.public_base_url}/generated/{settings.output_dir.name}/"
        f"{master_path.name}"
    )
    return f"data:image/png;base64,{encoded}", public_url


def build_state_prompt(state: PetVisualState) -> str:
    action = STATE_ACTION_PROMPTS[state]
    return (
        "把参考图中的角色视为唯一且不可重新设计的 Master Character。"
        "必须保持完全相同的角色身份与 2D 卡通画风：同一张脸、同一五官印象、同一年龄感与性别呈现、"
        "同一黑色长发及发型轮廓、同一肤色、同一淡紫色无袖连衣裙及白色花纹、同一白色鞋子、"
        "同一身体比例。只改变动作姿势，不得换脸、换发型、换衣服、改变发色或重画角色设定。"
        f"当前状态动作要求：{action}"
        "画面只保留一个完整全身人物，头发、双手、裙摆、双腿和双脚全部清晰完整，人物正面或近正面，"
        "身体四周保留至少 12% 安全留白，脚底完整入镜。背景使用干净纯浅色，人物边缘清晰，方便后续抠图。"
        "不要生成矩形边框、复杂场景、其他人物、额外肢体、大型文字、标志、水印或遮挡人物的大道具。"
        "Preserve the exact same character identity, hairstyle, face, skin tone, outfit, body proportions and illustration style. "
        "Pose change only. Do not redesign the character. Full body, complete hands and feet."
    )


async def generate_state_asset(
    *,
    character_id: str,
    state: str,
) -> dict[str, object]:
    if state not in STATE_ACTION_PROMPTS:
        raise CharacterGeneratorError(
            "invalid_pet_state",
            "不支持的桌宠状态",
            retryable=False,
            status_code=422,
        )
    visual_state = cast(PetVisualState, state)
    ark_settings = ArkSettings.from_environment()
    if not ark_settings.api_key:
        raise CharacterGeneratorError(
            "ark_not_configured",
            "豆包图片生成尚未配置 ARK_API_KEY",
            retryable=True,
            status_code=503,
        )

    asset_settings = AssetSettings.from_environment()
    master_reference, master_public_url = _load_master_reference(character_id, asset_settings)
    asset_id = f"{_safe_character_id(character_id)}_{visual_state}_{uuid.uuid4().hex[:10]}"
    started_at = time.perf_counter()
    provider_result = await request_seedream_image(
        ark_settings,
        prompt=build_state_prompt(visual_state),
        reference_image=master_reference,
    )
    try:
        assets = await process_character_assets(
            base_source=provider_result.source,
            character_id=asset_id,
            settings=asset_settings,
        )
    except CharacterAssetError as error:
        raise CharacterGeneratorError(
            error.code,
            error.message,
            retryable=error.retryable,
            status_code=error.status_code,
        ) from error

    duration_ms = round((time.perf_counter() - started_at) * 1000)
    return {
        "characterId": character_id,
        "masterImage": master_public_url,
        "asset": {
            "assetId": asset_id,
            "state": visual_state,
            **assets,
            "modelName": ark_settings.configured_model,
            "promptVersion": STATE_ASSET_PROMPT_VERSION,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "providerHttpStatus": provider_result.http_status,
            "durationMs": duration_ms,
        },
    }
