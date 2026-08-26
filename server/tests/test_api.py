import base64
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app
from services import character_generator
from services.character_assets import CharacterAssetError


async def stub_character_assets(*, base_source, character_id):
    assert base_source.startswith(("http://", "https://", "data:image/"))
    return {
        "baseImage": f"http://assets.test/{character_id}_base.png",
        "transparentImage": f"http://assets.test/{character_id}_transparent.png",
        "normalizedImage": f"http://assets.test/{character_id}_normalized.png",
    }


@pytest.mark.asyncio
async def test_health_works_without_api_key(monkeypatch):
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("ARK_API_STYLE", "official")
    monkeypatch.setenv("ARK_BASE_URL", character_generator.DEFAULT_BASE_URL)
    monkeypatch.setenv("ARK_IMAGE_MODEL", character_generator.DEFAULT_MODEL_LABEL)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "provider": "volcano-ark-seedream",
        "modelConfigured": True,
        "apiKeyConfigured": False,
        "deepseekConfigured": False,
    }


@pytest.mark.asyncio
async def test_generate_reports_missing_ark_configuration(monkeypatch):
    monkeypatch.delenv("ARK_API_KEY", raising=False)
    image = "data:image/png;base64," + base64.b64encode(b"small-test-image-payload").decode()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/character/generate",
            json={
                "imageBase64": image,
                "petName": "测试桌宠",
                "personality": "friendly",
                "motionStyle": "light",
            },
        )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "ark_not_configured"


@pytest.mark.asyncio
async def test_generate_sends_selected_crop_to_configured_ark_model(monkeypatch):
    captured = {}

    class StubAsyncClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, json=json)
            request = httpx.Request("POST", url)
            return httpx.Response(
                200,
                request=request,
                json={"data": [{"url": "https://example.test/generated-character.png"}]},
            )

    monkeypatch.setenv("ARK_API_KEY", "test-backend-only-key")
    monkeypatch.setenv("ARK_API_STYLE", "official")
    monkeypatch.setenv("ARK_IMAGE_MODEL", "ep-user-configured-model")
    monkeypatch.setenv("ARK_BASE_URL", "https://ark.example.test/api/v3")
    monkeypatch.setattr(character_generator.httpx, "AsyncClient", StubAsyncClient)
    monkeypatch.setattr(character_generator, "process_character_assets", stub_character_assets)

    image = "data:image/png;base64," + base64.b64encode(b"selected-person-crop").decode()
    result = await character_generator.generate_character(
        image_data_url=image,
        pet_name="测试桌宠",
        personality="friendly",
        motion_style="light",
    )

    assert captured["url"] == "https://ark.example.test/api/v3/images/generations"
    assert captured["headers"]["Authorization"] == "Bearer test-backend-only-key"
    assert captured["json"]["model"] == "ep-user-configured-model"
    assert captured["json"]["image"] == [image]
    assert "脚底四周都保留" in captured["json"]["prompt"]
    assert captured["json"]["response_format"] == "url"
    assert captured["json"]["sequential_image_generation"] == "disabled"
    assert result["baseImage"].endswith("_base.png")
    assert result["transparentImage"].endswith("_transparent.png")
    assert result["normalizedImage"].endswith("_normalized.png")
    assert result["modelName"] == "ep-user-configured-model"
    assert result["promptVersion"] == character_generator.PROMPT_VERSION
    assert result["createdAt"].endswith("+00:00")


@pytest.mark.asyncio
async def test_generate_uses_relay_contract_and_preserves_relay_model_name(monkeypatch):
    captured = {}

    class StubRelayClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, json=json)
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={"data": [{"url": "http://relay.test/generated-character.png"}]},
            )

    monkeypatch.setenv("ARK_API_KEY", "test-api-key")
    monkeypatch.setenv("ARK_API_STYLE", "relay")
    monkeypatch.setenv("ARK_IMAGE_MODEL", "Doubao-Seedream-5.0-lite")
    monkeypatch.setenv("ARK_BASE_URL", "http://relay.test/v1")
    monkeypatch.setattr(character_generator.httpx, "AsyncClient", StubRelayClient)
    monkeypatch.setattr(character_generator, "process_character_assets", stub_character_assets)

    image = "data:image/jpeg;base64," + base64.b64encode(b"selected-person-crop").decode()
    result = await character_generator.generate_character(
        image_data_url=image,
        pet_name="测试桌宠",
        personality="friendly",
        motion_style="light",
    )

    assert captured["url"] == "http://relay.test/v1/images/generations"
    assert captured["headers"]["Authorization"] == "Bearer test-api-key"
    assert captured["json"] == {
        "model": "Doubao-Seedream-5.0-lite",
        "prompt": captured["json"]["prompt"],
        "image": [image],
        "watermark": False,
        "n": 1,
        "size": "2k",
        "output_format": "png",
    }
    assert "response_format" not in captured["json"]
    assert "sequential_image_generation" not in captured["json"]
    assert result["modelName"] == "Doubao-Seedream-5.0-lite"
    assert result["baseImage"].endswith("_base.png")
    assert result["transparentImage"].endswith("_transparent.png")
    assert result["normalizedImage"].endswith("_normalized.png")


@pytest.mark.asyncio
async def test_ark_auth_failure_can_be_retried_after_backend_key_is_fixed(monkeypatch):
    class UnauthorizedAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, **_kwargs):
            return httpx.Response(
                401,
                request=httpx.Request("POST", url),
                headers={"x-request-id": "request-test-401"},
                json={"error": {"message": "unauthorized"}},
            )

    monkeypatch.setenv("ARK_API_KEY", "invalid-test-key")
    monkeypatch.setattr(character_generator.httpx, "AsyncClient", UnauthorizedAsyncClient)
    image = "data:image/png;base64," + base64.b64encode(b"selected-person-crop").decode()

    with pytest.raises(character_generator.CharacterGeneratorError) as error_info:
        await character_generator.generate_character(
            image_data_url=image,
            pet_name="测试桌宠",
            personality="friendly",
            motion_style="light",
        )

    assert error_info.value.code == "ark_api_error"
    assert error_info.value.retryable is True
    assert "鉴权失败" in error_info.value.message
    assert "request-test-401" in error_info.value.message


@pytest.mark.asyncio
async def test_relay_gateway_failure_reports_upstream_status_without_retrying(monkeypatch):
    class BadGatewayAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, **_kwargs):
            return httpx.Response(
                502,
                request=httpx.Request("POST", url),
            )

    monkeypatch.setenv("ARK_API_KEY", "test-api-key")
    monkeypatch.setenv("ARK_API_STYLE", "relay")
    monkeypatch.setenv("ARK_IMAGE_MODEL", "Doubao-Seedream-5.0-lite")
    monkeypatch.setenv("ARK_BASE_URL", "http://relay.test/v1")
    monkeypatch.setattr(character_generator.httpx, "AsyncClient", BadGatewayAsyncClient)
    image = "data:image/png;base64," + base64.b64encode(b"selected-person-crop").decode()

    with pytest.raises(character_generator.CharacterGeneratorError) as error_info:
        await character_generator.generate_character(
            image_data_url=image,
            pet_name="测试桌宠",
            personality="friendly",
            motion_style="light",
        )

    assert error_info.value.code == "ark_api_error"
    assert error_info.value.retryable is True
    assert error_info.value.message == "图片中转站暂时不可用（HTTP 502），请稍后重试"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("asset_code", "asset_message"),
    [
        ("transparent_asset_failed", "角色透明化失败，请重试或更换图片"),
        ("normalization_failed", "透明角色标准化失败，图片没有可用人物区域"),
    ],
)
async def test_asset_failures_are_returned_with_specific_codes(
    monkeypatch,
    asset_code,
    asset_message,
):
    class SuccessfulProviderClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, **_kwargs):
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={"data": [{"url": "https://example.test/base.png"}]},
            )

    async def failing_assets(**_kwargs):
        raise CharacterAssetError(asset_code, asset_message)

    monkeypatch.setenv("ARK_API_KEY", "test-backend-only-key")
    monkeypatch.setattr(character_generator.httpx, "AsyncClient", SuccessfulProviderClient)
    monkeypatch.setattr(character_generator, "process_character_assets", failing_assets)
    image = "data:image/png;base64," + base64.b64encode(b"selected-person-crop").decode()

    with pytest.raises(character_generator.CharacterGeneratorError) as error_info:
        await character_generator.generate_character(
            image_data_url=image,
            pet_name="测试桌宠",
            personality="friendly",
            motion_style="light",
        )

    assert error_info.value.code == asset_code
    assert error_info.value.message == asset_message
    assert error_info.value.retryable is True
