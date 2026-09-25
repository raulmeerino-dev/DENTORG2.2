from types import SimpleNamespace

import httpx
import pytest

from app.domains.ai.application.copilot_provider import InvalidModelResponse, ToolCallingProvider


@pytest.mark.asyncio
async def test_responses_replays_reasoning_and_calls_without_remote_storage(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="openai",
        openai_api_key="test-key-not-real",
        openai_model="test-model",
        openai_timeout_seconds=5,
        openai_responses_endpoint="https://api.openai.com/v1/responses",
    )
    output = [
        {
            "type": "reasoning",
            "id": "reason-1",
            "summary": [],
            "encrypted_content": "encrypted-test-context",
        },
        {
            "type": "function_call",
            "call_id": "call-1",
            "name": "navigate",
            "arguments": '{"module":"agenda"}',
        },
    ]
    requests = []
    real_client = httpx.AsyncClient

    def handle(request):
        import json

        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"output": output})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs),
    )
    provider = ToolCallingProvider(settings)
    first = await provider.complete("System", [{"role": "user", "content": "Calendario"}], [])
    await provider.complete(
        "System",
        [
            first,
            {
                "role": "tool",
                "call_id": "call-1",
                "content": '{"navigation":"/jornada?vista=agenda"}',
            },
        ],
        [],
    )
    assert requests[1]["store"] is False
    assert requests[0]["include"] == ["reasoning.encrypted_content"]
    assert requests[1]["input"][:2] == output
    assert requests[1]["input"][2]["call_id"] == "call-1"


@pytest.mark.asyncio
async def test_malformed_tool_response_is_not_executed(monkeypatch):
    settings = SimpleNamespace(
        llm_provider="ollama",
        ollama_model="test-model",
        ollama_timeout_seconds=5,
        ollama_base_url="http://localhost:11434",
    )
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"message": None})),
            **kwargs,
        ),
    )
    with pytest.raises(InvalidModelResponse):
        await ToolCallingProvider(settings).complete("System", [], [])
