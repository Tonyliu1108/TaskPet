from __future__ import annotations

import os
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Optional

import httpx


class DeepSeekClientError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        *,
        fallbackable: bool,
        upstream_http_status: Optional[int] = None,
        upstream_latency_ms: Optional[int] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fallbackable = fallbackable
        self.upstream_http_status = upstream_http_status
        self.upstream_latency_ms = upstream_latency_ms

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


@dataclass(frozen=True)
class DeepSeekSettings:
    api_base: str
    api_key: str
    primary_model: str
    fallback_model: str
    timeout_seconds: float

    @classmethod
    def from_environment(cls) -> "DeepSeekSettings":
        return cls(
            api_base=os.getenv("DEEPSEEK_API_BASE", "").rstrip("/"),
            api_key=os.getenv("DEEPSEEK_API_KEY", ""),
            primary_model=os.getenv("DEEPSEEK_MODEL_PRIMARY", "deepseek-v4-pro"),
            fallback_model=os.getenv("DEEPSEEK_MODEL_FALLBACK", "deepseek-v4-flash"),
            timeout_seconds=float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90")),
        )

    @property
    def configured(self) -> bool:
        return bool(self.api_base and self.api_key)


@dataclass(frozen=True)
class DeepSeekCompletion:
    content: str
    upstream_http_status: int
    upstream_latency_ms: int


class DeepSeekClient:
    def __init__(self, settings: DeepSeekSettings):
        if not settings.configured:
            raise DeepSeekClientError("AI_NOT_CONFIGURED", "AI 服务尚未配置。", 503, fallbackable=False)
        self.settings = settings

    def complete(self, *, model: str, system_prompt: str, user_prompt: str) -> DeepSeekCompletion:
        started_at = perf_counter()
        try:
            response = httpx.post(
                f"{self.settings.api_base}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.api_key}"},
                json={
                    "model": model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
                timeout=self.settings.timeout_seconds,
            )
        except httpx.TimeoutException as error:
            raise DeepSeekClientError(
                "AI_TIMEOUT", "AI 分析超时，请稍后重试。", 504,
                fallbackable=True,
                upstream_latency_ms=round((perf_counter() - started_at) * 1000),
            ) from error
        except httpx.HTTPError as error:
            raise DeepSeekClientError(
                "AI_UPSTREAM_ERROR", "AI 服务暂时不可用，请稍后重试。", 502,
                fallbackable=True,
                upstream_latency_ms=round((perf_counter() - started_at) * 1000),
            ) from error

        latency_ms = round((perf_counter() - started_at) * 1000)
        if response.status_code in (401, 403):
            try:
                payload = response.json()
                error = payload.get("error", {}) if isinstance(payload, dict) else {}
                error_code = error.get("code", "") if isinstance(error, dict) else ""
            except ValueError:
                error_code = ""
            message = "AI 服务额度不足。" if error_code == "insufficient_user_quota" else "AI 服务鉴权失败，请检查后端配置。"
            code = "AI_QUOTA_EXCEEDED" if error_code == "insufficient_user_quota" else "AI_AUTH_FAILED"
            raise DeepSeekClientError(code, message, response.status_code, fallbackable=False, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
        if response.status_code == 429:
            raise DeepSeekClientError("AI_UPSTREAM_ERROR", "AI 服务繁忙，请稍后重试。", 502, fallbackable=True, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
        if response.status_code >= 500:
            raise DeepSeekClientError("AI_UPSTREAM_ERROR", "AI 服务暂时不可用，请稍后重试。", 502, fallbackable=True, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
        if response.status_code >= 400:
            raise DeepSeekClientError("AI_MODEL_UNAVAILABLE", "AI 模型当前不可用，请稍后重试。", 502, fallbackable=True, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
        try:
            payload: dict[str, Any] = response.json()
            content = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise DeepSeekClientError("AI_INVALID_RESPONSE", "AI 返回格式异常，请重新生成。", 502, fallbackable=True, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms) from error
        if not isinstance(content, str) or not content.strip():
            raise DeepSeekClientError("AI_INVALID_RESPONSE", "AI 返回内容为空，请重新生成。", 502, fallbackable=True, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
        return DeepSeekCompletion(content=content, upstream_http_status=response.status_code, upstream_latency_ms=latency_ms)
