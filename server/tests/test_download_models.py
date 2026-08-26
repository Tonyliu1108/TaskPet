from __future__ import annotations

import hashlib
import importlib.util
import io
from pathlib import Path
from urllib.error import URLError

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "download_models.py"
SPEC = importlib.util.spec_from_file_location("download_models", SCRIPT_PATH)
assert SPEC and SPEC.loader
download_models = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(download_models)


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


def test_downloader_uses_pinned_upstream_int8_variant():
    assert download_models.MODEL_URL == (
        "https://storage.googleapis.com/mediapipe-models/object_detector/"
        "efficientdet_lite0/int8/1/efficientdet_lite0.tflite"
    )
    assert download_models.MODEL_PATH == (
        ROOT / "public" / "models" / "efficientdet_lite0.tflite"
    )


def test_download_is_validated_and_installed_atomically(tmp_path, monkeypatch):
    model_bytes = b"\x20\x00\x00\x00TFL3test-model"
    destination = tmp_path / "models" / "efficientdet_lite0.tflite"
    monkeypatch.setattr(
        download_models,
        "EXPECTED_SHA256",
        hashlib.sha256(model_bytes).hexdigest(),
    )
    monkeypatch.setattr(
        download_models.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: FakeResponse(model_bytes),
    )

    result = download_models.download_model(destination=destination)

    assert result == destination
    assert destination.read_bytes() == model_bytes
    assert not destination.with_suffix(".tflite.download").exists()


def test_download_failure_leaves_no_partial_model(tmp_path, monkeypatch):
    destination = tmp_path / "models" / "efficientdet_lite0.tflite"

    def fail(*_args, **_kwargs):
        raise URLError("offline")

    monkeypatch.setattr(download_models.urllib.request, "urlopen", fail)

    with pytest.raises(download_models.ModelDownloadError, match="offline"):
        download_models.download_model(destination=destination)

    assert not destination.exists()
    assert not destination.with_suffix(".tflite.download").exists()
