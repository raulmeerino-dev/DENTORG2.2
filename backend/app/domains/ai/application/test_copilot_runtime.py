import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.domains.ai.application.copilot_runtime import preload_local_model


def settings(**changes):
    return SimpleNamespace(**({
        "llm_provider": "ollama", "openai_api_key": "", "openai_model": "unused",
        "ollama_model": "local-test-model", "ollama_base_url": "http://localhost:11434",
        "ollama_preload": True, "ollama_keep_alive": "24h", "ollama_context_length": 16384,
    } | changes))


@pytest.mark.asyncio
async def test_preload_matches_inference_memory_settings_without_patient_content(monkeypatch):
    import json

    requests = []
    real_client = httpx.AsyncClient

    def handle(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"done": True})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: real_client(
        transport=httpx.MockTransport(handle), **kwargs,
    ))
    await preload_local_model(settings())
    assert requests == [{"model": "local-test-model", "messages": [], "stream": False,
                         "keep_alive": "24h", "options": {"num_ctx": 16384}}]


@pytest.mark.asyncio
@pytest.mark.parametrize("overrides", [
    {"ollama_preload": False}, {"llm_provider": "openai"},
    {"llm_provider": "auto", "openai_api_key": "test-key"},
])
async def test_preload_never_contacts_unused_or_disabled_provider(monkeypatch, overrides):
    def unexpected(**kwargs):
        pytest.fail("No provider should be contacted")

    monkeypatch.setattr(httpx, "AsyncClient", unexpected)
    await preload_local_model(settings(**overrides))


@pytest.mark.asyncio
async def test_preload_failure_does_not_break_startup(monkeypatch):
    real_client = httpx.AsyncClient

    def offline(request):
        raise httpx.ConnectError("offline", request=request)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: real_client(
        transport=httpx.MockTransport(offline), **kwargs,
    ))
    await preload_local_model(settings())


@pytest.mark.asyncio
async def test_application_can_start_while_model_loads_and_cancels_on_shutdown(monkeypatch):
    import app.main as main

    started, cancelled = asyncio.Event(), asyncio.Event()

    async def preload(_settings):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(main, "preload_local_model", preload)
    monkeypatch.setattr(main, "start_backup_scheduler", lambda: None)
    monkeypatch.setattr(main.hub, "start", AsyncMock())
    monkeypatch.setattr(main.hub, "stop", AsyncMock())
    async with asyncio.timeout(1):
        async with main.lifespan(main.app):
            await started.wait()
            assert not cancelled.is_set()
    assert cancelled.is_set()
    main.hub.stop.assert_awaited_once()
