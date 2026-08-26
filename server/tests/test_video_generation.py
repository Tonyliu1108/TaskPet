from services.character_generator import ArkSettings
from services.video_generation import (
    DEFAULT_VIDEO_MODEL,
    PROVIDER_MINIMUM_DURATION_SECONDS,
    build_video_payload,
)


def test_build_video_payload_is_real_image_to_video_request():
    payload = build_video_payload(
        model=DEFAULT_VIDEO_MODEL,
        reference_image="data:image/png;base64,AAAA",
        prompt="walk in place",
    )

    assert payload["model"] == "Doubao-Seedance-2.0-fast"
    assert payload["image"].startswith("data:image/png;base64,")
    assert payload["duration"] == PROVIDER_MINIMUM_DURATION_SECONDS == 4
    assert payload["metadata"] == {
        "duration": 4,
        "ratio": "1:1",
        "resolution": "720p",
        "watermark": False,
        "generate_audio": False,
    }


def test_compatible_settings_keep_exact_video_model(monkeypatch):
    monkeypatch.setenv("ARK_API_STYLE", "relay")
    monkeypatch.setenv("ARK_BASE_URL", "http://provider.test/v1")
    monkeypatch.setenv("ARK_IMAGE_MODEL", "Doubao-Seedream-5.0-lite")

    settings = ArkSettings.from_environment()

    assert settings.api_style == "relay"
    assert settings.base_url == "http://provider.test/v1"
