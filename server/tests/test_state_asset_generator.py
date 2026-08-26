import io
import sys
from pathlib import Path

import httpx
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from services.character_assets import AssetSettings
from services.character_generator import CharacterGeneratorError, SeedreamGeneration
from services import state_asset_generator


def write_master(path: Path) -> None:
    image = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((300, 60, 468, 722), fill=(170, 110, 180, 255))
    output = io.BytesIO()
    image.save(output, format="PNG")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output.getvalue())


@pytest.mark.asyncio
async def test_generate_state_asset_uses_master_normalized_image_and_b1_pipeline(
    tmp_path,
    monkeypatch,
):
    output_dir = tmp_path / "characters"
    write_master(output_dir / "char_master_normalized.png")
    settings = AssetSettings(
        output_dir=output_dir,
        public_base_url="http://assets.test",
        rembg_model="test-model",
        canvas_size=768,
        download_timeout_seconds=1,
    )
    captured = {}

    async def stub_seedream(_settings, *, prompt, reference_image):
        captured.update(prompt=prompt, reference_image=reference_image)
        return SeedreamGeneration(
            source="https://provider.test/state.png",
            http_status=200,
            request_id="provider-state-test",
        )

    async def stub_assets(*, base_source, character_id, settings):
        captured.update(
            base_source=base_source,
            asset_id=character_id,
            asset_settings=settings,
        )
        return {
            "baseImage": f"http://assets.test/{character_id}_base.png",
            "transparentImage": f"http://assets.test/{character_id}_transparent.png",
            "normalizedImage": f"http://assets.test/{character_id}_normalized.png",
        }

    monkeypatch.setenv("ARK_API_KEY", "test-backend-only-key")
    monkeypatch.setattr(state_asset_generator.AssetSettings, "from_environment", lambda: settings)
    monkeypatch.setattr(state_asset_generator, "request_seedream_image", stub_seedream)
    monkeypatch.setattr(state_asset_generator, "process_character_assets", stub_assets)

    result = await state_asset_generator.generate_state_asset(
        character_id="char_master",
        state="thinking",
    )

    asset = result["asset"]
    assert captured["reference_image"].startswith("data:image/png;base64,")
    assert "Master Character" in captured["prompt"]
    assert "一只手轻托下巴" in captured["prompt"]
    assert captured["base_source"] == "https://provider.test/state.png"
    assert captured["asset_id"].startswith("char_master_thinking_")
    assert asset["state"] == "thinking"
    assert asset["providerHttpStatus"] == 200
    assert asset["normalizedImage"].endswith("_normalized.png")
    assert result["masterImage"].endswith("char_master_normalized.png")


@pytest.mark.asyncio
async def test_generate_state_asset_rejects_missing_master(tmp_path, monkeypatch):
    settings = AssetSettings(
        output_dir=tmp_path / "characters",
        public_base_url="http://assets.test",
        rembg_model="test-model",
        canvas_size=768,
        download_timeout_seconds=1,
    )
    monkeypatch.setenv("ARK_API_KEY", "test-backend-only-key")
    monkeypatch.setattr(state_asset_generator.AssetSettings, "from_environment", lambda: settings)

    with pytest.raises(CharacterGeneratorError) as error_info:
        await state_asset_generator.generate_state_asset(
            character_id="char_missing",
            state="idle",
        )

    assert error_info.value.code == "master_character_not_found"
    assert error_info.value.status_code == 404


@pytest.mark.asyncio
async def test_state_asset_api_returns_single_state_result(monkeypatch):
    async def stub_generate_state_asset(*, character_id, state):
        return {
            "characterId": character_id,
            "masterImage": "http://assets.test/char_master_normalized.png",
            "asset": {
                "assetId": "char_master_idle_test",
                "state": state,
                "baseImage": "http://assets.test/base.png",
                "transparentImage": "http://assets.test/transparent.png",
                "normalizedImage": "http://assets.test/normalized.png",
                "modelName": "Doubao-Seedream-5.0-lite",
                "promptVersion": "test-state-prompt",
                "createdAt": "2026-08-14T00:00:00+00:00",
                "providerHttpStatus": 200,
                "durationMs": 1234,
            },
        }

    monkeypatch.setattr(main, "generate_state_asset", stub_generate_state_asset)
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/character/generate-state-asset",
            json={"characterId": "char_master", "state": "idle"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["asset"]["state"] == "idle"
    assert payload["asset"]["durationMs"] == 1234
