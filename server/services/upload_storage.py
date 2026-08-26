from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from openpyxl import load_workbook


XLSX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "application/zip",
    "",
}
FILE_ID_PATTERN = re.compile(r"^file_[0-9a-f]{32}$")


class FileStorageError(Exception):
    def __init__(self, code: str, message: str, status_code: int, **context: object):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.context = context

    def as_detail(self) -> dict[str, object]:
        return {"code": self.code, "message": self.message, **self.context}


@dataclass(frozen=True)
class UploadSettings:
    upload_dir: Path
    max_upload_bytes: int

    @classmethod
    def from_environment(cls) -> "UploadSettings":
        server_dir = Path(__file__).resolve().parents[1]
        configured = Path(os.getenv("UPLOAD_DIR", "runtime/uploads"))
        upload_dir = configured if configured.is_absolute() else server_dir / configured
        return cls(
            upload_dir=upload_dir,
            max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))),
        )


def _paths(settings: UploadSettings, file_id: str) -> tuple[Path, Path]:
    if not FILE_ID_PATTERN.fullmatch(file_id):
        raise FileStorageError("FILE_NOT_FOUND", "找不到已上传的文件，请重新上传。", 404)
    return settings.upload_dir / f"{file_id}.xlsx", settings.upload_dir / f"{file_id}.json"


def save_upload(
    stream: BinaryIO,
    original_name: str,
    content_type: str | None,
    settings: UploadSettings,
) -> dict[str, object]:
    safe_name = Path(original_name or "").name
    if Path(safe_name).suffix.lower() != ".xlsx":
        raise FileStorageError("INVALID_FILE_TYPE", "目前只支持 .xlsx 文件。", 400)
    normalized_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type not in XLSX_MIME_TYPES:
        raise FileStorageError("INVALID_FILE_TYPE", "文件类型不是有效的 XLSX。", 400)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = f"file_{uuid.uuid4().hex}"
    final_path, metadata_path = _paths(settings, file_id)
    temp_path = settings.upload_dir / f".{file_id}.uploading"
    size = 0

    try:
        with temp_path.open("wb") as destination:
            while chunk := stream.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise FileStorageError(
                        "FILE_TOO_LARGE",
                        f"文件超过 {settings.max_upload_bytes // (1024 * 1024)} MB 上限。",
                        413,
                        maxBytes=settings.max_upload_bytes,
                    )
                destination.write(chunk)
        if size == 0:
            raise FileStorageError("INVALID_XLSX", "上传的 XLSX 文件为空。", 400)
        try:
            with temp_path.open("rb") as source:
                workbook = load_workbook(source, read_only=True, data_only=False)
                workbook.close()
        except Exception as error:
            raise FileStorageError("INVALID_XLSX", "文件无法作为有效的 XLSX 打开。", 400) from error

        uploaded_at = datetime.now(timezone.utc).isoformat()
        temp_path.replace(final_path)
        metadata = {
            "fileId": file_id,
            "fileName": safe_name,
            "size": size,
            "extension": ".xlsx",
            "contentType": content_type or "",
            "uploadedAt": uploaded_at,
        }
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        return metadata
    except Exception:
        temp_path.unlink(missing_ok=True)
        final_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        raise


def resolve_upload(file_id: str, settings: UploadSettings) -> tuple[Path, dict[str, object]]:
    file_path, metadata_path = _paths(settings, file_id)
    if not file_path.is_file() or not metadata_path.is_file():
        raise FileStorageError("FILE_NOT_FOUND", "找不到已上传的文件，请重新上传。", 404)
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FileStorageError("FILE_NOT_FOUND", "上传文件的元数据已损坏，请重新上传。", 404) from error
    if metadata.get("fileId") != file_id:
        raise FileStorageError("FILE_NOT_FOUND", "上传文件标识不匹配，请重新上传。", 404)
    return file_path, metadata
