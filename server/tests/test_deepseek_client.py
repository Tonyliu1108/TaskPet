import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.deepseek_client import DeepSeekClient, DeepSeekClientError, DeepSeekSettings


SETTINGS = DeepSeekSettings('http://relay/v1', 'secret-for-test', 'pro', 'flash', 1)


class FakeResponse:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


def test_client_success_uses_non_streaming_chat_completions(monkeypatch):
    captured = {}
    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return FakeResponse(200, {'choices': [{'message': {'content': '{"ok":true}', 'reasoning_content': 'private'}}]})
    monkeypatch.setattr('services.deepseek_client.httpx.post', post)
    completion = DeepSeekClient(SETTINGS).complete(model='pro', system_prompt='s', user_prompt='u')
    assert completion.content == '{"ok":true}' and completion.upstream_latency_ms >= 0
    assert completion.upstream_http_status == 200
    assert captured['json']['stream'] is False
    assert 'response_format' not in captured['json']


@pytest.mark.parametrize(
    'status,payload,code,fallbackable',
    [
        (401, {'error': {'code': 'invalid_api_key'}}, 'AI_AUTH_FAILED', False),
        (403, {'error': {'code': 'insufficient_user_quota'}}, 'AI_QUOTA_EXCEEDED', False),
        (429, {'error': {}}, 'AI_UPSTREAM_ERROR', True),
        (500, {'error': {}}, 'AI_UPSTREAM_ERROR', True),
        (404, {'error': {'code': 'model_not_found'}}, 'AI_MODEL_UNAVAILABLE', True),
    ],
)
def test_client_maps_upstream_status(monkeypatch, status, payload, code, fallbackable):
    monkeypatch.setattr('services.deepseek_client.httpx.post', lambda *args, **kwargs: FakeResponse(status, payload))
    with pytest.raises(DeepSeekClientError) as error:
        DeepSeekClient(SETTINGS).complete(model='pro', system_prompt='s', user_prompt='u')
    assert error.value.code == code
    assert error.value.fallbackable is fallbackable


def test_client_maps_timeout(monkeypatch):
    def timeout(*args, **kwargs): raise httpx.ReadTimeout('timeout')
    monkeypatch.setattr('services.deepseek_client.httpx.post', timeout)
    with pytest.raises(DeepSeekClientError) as error:
        DeepSeekClient(SETTINGS).complete(model='pro', system_prompt='s', user_prompt='u')
    assert error.value.code == 'AI_TIMEOUT' and error.value.fallbackable is True


def test_client_rejects_malformed_success_shape(monkeypatch):
    monkeypatch.setattr('services.deepseek_client.httpx.post', lambda *args, **kwargs: FakeResponse(200, {'choices': []}))
    with pytest.raises(DeepSeekClientError) as error:
        DeepSeekClient(SETTINGS).complete(model='pro', system_prompt='s', user_prompt='u')
    assert error.value.code == 'AI_INVALID_RESPONSE'
