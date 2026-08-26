import base64
import io
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.character_assets import (
    AssetSettings,
    CharacterAssetError,
    FOOT_BASELINE_RATIO,
    alpha_content_bbox,
    keep_primary_alpha_component,
    normalize_transparent_png,
    process_character_assets,
    remove_background_png,
)


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def synthetic_transparent_character() -> bytes:
    image = Image.new("RGBA", (260, 460), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((82, 12, 178, 108), fill=(246, 199, 164, 255))
    draw.polygon([(68, 104), (192, 104), (220, 350), (40, 350)], fill=(177, 129, 191, 255))
    draw.rectangle((25, 135, 60, 305), fill=(246, 199, 164, 255))
    draw.rectangle((200, 135, 235, 305), fill=(246, 199, 164, 255))
    draw.rectangle((82, 345, 118, 448), fill=(246, 199, 164, 255))
    draw.rectangle((142, 345, 178, 448), fill=(246, 199, 164, 255))
    return png_bytes(image)


def test_normalize_uses_alpha_bbox_centers_character_and_aligns_feet():
    normalized = normalize_transparent_png(synthetic_transparent_character(), 768)
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.mode == "RGBA"
        assert image.size == (768, 768)
        bbox = alpha_content_bbox(image, threshold=0)
        assert bbox is not None
        left, top, right, bottom = bbox
        assert abs(((left + right) / 2) - 384) <= 2
        assert bottom == round(768 * FOOT_BASELINE_RATIO)
        assert top >= round(768 * 0.06)
        assert left >= round(768 * 0.06)
        assert right <= round(768 * 0.94)
        assert image.getpixel((0, 0))[3] == 0
        assert image.getpixel((767, 767))[3] == 0


def test_remove_background_rejects_opaque_output(monkeypatch):
    opaque = Image.new("RGB", (64, 64), "white")
    monkeypatch.setattr(
        "services.character_assets._run_rembg",
        lambda _image, _model: png_bytes(opaque),
    )

    with pytest.raises(CharacterAssetError) as error_info:
        remove_background_png(png_bytes(opaque), "test-model")

    assert error_info.value.code == "transparent_asset_failed"
    assert "Alpha" in error_info.value.message


def test_primary_alpha_component_removes_disconnected_background_remnants():
    image = Image.new("RGBA", (220, 320), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 20, 160, 270), fill=(120, 90, 180, 255))
    draw.rectangle((15, 300, 25, 310), fill=(210, 200, 190, 80))

    cleaned = keep_primary_alpha_component(image)

    assert cleaned.getpixel((20, 305))[3] == 0
    assert cleaned.getpixel((110, 100))[3] == 255
    assert alpha_content_bbox(cleaned, threshold=0) == (60, 20, 161, 271)


@pytest.mark.asyncio
async def test_process_character_assets_saves_base_transparent_and_normalized_png(tmp_path):
    base = Image.new("RGB", (300, 500), "#f5f0e5")
    base_payload = png_bytes(base)
    data_url = "data:image/png;base64," + base64.b64encode(base_payload).decode()
    transparent_payload = synthetic_transparent_character()
    settings = AssetSettings(
        output_dir=tmp_path / "characters",
        public_base_url="http://assets.test",
        rembg_model="test-model",
        canvas_size=768,
        download_timeout_seconds=1,
    )

    result = await process_character_assets(
        base_source=data_url,
        character_id="char_test_assets",
        settings=settings,
        background_remover=lambda _payload, _model: transparent_payload,
    )

    assert set(result) == {"baseImage", "transparentImage", "normalizedImage"}
    assert result["normalizedImage"].endswith("/generated/characters/char_test_assets_normalized.png")
    for suffix in ("base", "transparent", "normalized"):
        path = settings.output_dir / f"char_test_assets_{suffix}.png"
        assert path.exists()
        with Image.open(path) as image:
            assert image.format == "PNG"
    with Image.open(settings.output_dir / "char_test_assets_normalized.png") as normalized:
        assert normalized.mode == "RGBA"
        assert normalized.size == (768, 768)
        assert normalized.getpixel((0, 0))[3] == 0


def test_normalize_rejects_fully_transparent_image():
    empty = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    with pytest.raises(CharacterAssetError) as error_info:
        normalize_transparent_png(png_bytes(empty), 768)
    assert error_info.value.code == "normalization_failed"
