#!/usr/bin/env python3
"""Download TaskPet's external browser-vision model from its upstream provider."""

from __future__ import annotations

import hashlib
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/object_detector/"
    "efficientdet_lite0/int8/1/efficientdet_lite0.tflite"
)
MODEL_PATH = (
    Path(__file__).resolve().parents[1]
    / "public"
    / "models"
    / "efficientdet_lite0.tflite"
)
EXPECTED_SHA256 = "0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb"


class ModelDownloadError(RuntimeError):
    """Raised when the upstream model cannot be downloaded or validated."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_expected_model(path: Path) -> bool:
    if not path.is_file() or _sha256(path) != EXPECTED_SHA256:
        return False
    with path.open("rb") as model_file:
        model_file.seek(4)
        return model_file.read(4) == b"TFL3"


def download_model(
    url: str = MODEL_URL,
    destination: Path = MODEL_PATH,
) -> Path:
    """Download and atomically install the pinned EfficientDet-Lite0 model."""
    destination = Path(destination)
    if _is_expected_model(destination):
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = destination.with_suffix(destination.suffix + ".download")
    temporary_path.unlink(missing_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "TaskPet-model-downloader/1.0"},
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            status = getattr(response, "status", 200)
            if status != 200:
                raise ModelDownloadError(f"upstream returned HTTP {status}")
            with temporary_path.open("wb") as model_file:
                while chunk := response.read(1024 * 1024):
                    model_file.write(chunk)

        if not _is_expected_model(temporary_path):
            raise ModelDownloadError(
                "downloaded file failed the pinned SHA-256 or TFLite format check"
            )
        os.replace(temporary_path, destination)
        return destination
    except (OSError, urllib.error.URLError, ModelDownloadError) as error:
        temporary_path.unlink(missing_ok=True)
        if isinstance(error, ModelDownloadError):
            raise
        raise ModelDownloadError(str(error)) from error


def main() -> int:
    try:
        model_path = download_model()
    except ModelDownloadError as error:
        print(f"Model download failed: {error}", file=sys.stderr)
        print(f"Upstream URL: {MODEL_URL}", file=sys.stderr)
        print("Check network access and run this command again.", file=sys.stderr)
        return 1

    print(f"EfficientDet-Lite0 is ready at {model_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
