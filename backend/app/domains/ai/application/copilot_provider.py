"""Native function calling adapters. No keyword router or simulated interpretation."""

import json
from uuid import uuid4

import httpx


class ProviderUnavailable(Exception):
    pass


class InvalidModelResponse(Exception):
    pass


def parse_call(name, arguments, call_id=None):
    if isinstance(arguments, str):
        arguments = json.loads(arguments)
    if not isinstance(name, str) or not isinstance(arguments, dict):
        raise InvalidModelResponse()
    return {"id": call_id or str(uuid4()), "name": name, "arguments": arguments}


def strict_schema(schema):
    # OpenAI strict tools require all keys, optional values represented as null.
    if isinstance(schema, dict):
        schema = {k: strict_schema(v) for k, v in schema.items() if k not in {"title", "default"}}
        if schema.get("type") == "object":
            props = schema.get("properties", {})
            required = schema.get("required", [])
            for key, value in props.items():
                if key not in required and "anyOf" not in value:
                    props[key] = {"anyOf": [value, {"type": "null"}]}
            schema.update(additionalProperties=False, required=list(props))
    elif isinstance(schema, list):
        schema = [strict_schema(v) for v in schema]
    return schema


class ToolCallingProvider:
    def __init__(self, settings):
        self.settings = settings
        self.name = (
            settings.llm_provider
            if settings.llm_provider != "auto"
            else ("openai" if settings.openai_api_key else "ollama")
        )
        self.model = settings.openai_model if self.name == "openai" else settings.ollama_model

    async def complete(self, system, messages, tools):
        if self.name not in {"ollama", "openai"}:
            raise ProviderUnavailable()
        try:
            timeout = min(
                60,
                self.settings.ollama_timeout_seconds
                if self.name == "ollama"
                else self.settings.openai_timeout_seconds,
            )
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=3)) as client:
                if self.name == "ollama":
                    native = [{"role": "system", "content": system}]
                    for m in messages:
                        item = {"role": m["role"], "content": m.get("content", "")}
                        if m.get("calls"):
                            item["tool_calls"] = [
                                {"function": {"name": c["name"], "arguments": c["arguments"]}}
                                for c in m["calls"]
                            ]
                        if m.get("tool_name"):
                            item["tool_name"] = m["tool_name"]
                        native.append(item)
                    response = await client.post(
                        self.settings.ollama_base_url.rstrip("/") + "/api/chat",
                        json={
                            "model": self.model,
                            "stream": False,
                            "messages": native,
                            "tools": [{"type": "function", "function": t} for t in tools],
                            "options": {"temperature": 0, "num_ctx": 16384, "num_predict": 1200},
                            "keep_alive": "10m",
                        },
                    )
                    response.raise_for_status()
                    message = response.json()["message"]
                    calls = [
                        parse_call(c["function"]["name"], c["function"]["arguments"])
                        for c in message.get("tool_calls", [])
                    ]
                    return {
                        "role": "assistant",
                        "content": message.get("content", "")[:4000],
                        "calls": calls[:6],
                    }
                if not self.settings.openai_api_key:
                    raise ProviderUnavailable()
                native = []
                for m in messages:
                    if m.get("native_output"):
                        native.extend(m["native_output"])
                        continue
                    if m["role"] == "tool":
                        native.append(
                            {
                                "type": "function_call_output",
                                "call_id": m["call_id"],
                                "output": m["content"],
                            }
                        )
                    else:
                        if m.get("content"):
                            native.append({"role": m["role"], "content": m["content"]})
                        native.extend(
                            {
                                "type": "function_call",
                                "call_id": c["id"],
                                "name": c["name"],
                                "arguments": json.dumps(c["arguments"]),
                            }
                            for c in m.get("calls", [])
                        )
                response = await client.post(
                    self.settings.openai_responses_endpoint,
                    headers={"Authorization": f"Bearer {self.settings.openai_api_key}"},
                    json={
                        "model": self.model,
                        "instructions": system,
                        "input": native,
                        "store": False,
                        "include": ["reasoning.encrypted_content"],
                        "tools": [
                            {
                                "type": "function",
                                **t,
                                "parameters": strict_schema(t["parameters"]),
                                "strict": True,
                            }
                            for t in tools
                        ],
                        "parallel_tool_calls": False,
                    },
                )
                response.raise_for_status()
                output = response.json()["output"]
                calls = [
                    parse_call(i["name"], i["arguments"], i["call_id"])
                    for i in output
                    if i["type"] == "function_call"
                ]
                content = "\n".join(
                    part.get("text", "")
                    for i in output
                    if i["type"] == "message"
                    for part in i.get("content", [])
                )
                if len(calls) > 6:
                    raise InvalidModelResponse()
                return {
                    "role": "assistant",
                    "content": content[:4000],
                    "calls": calls,
                    "native_output": output,
                }
        except (httpx.HTTPError, KeyError) as exc:
            raise ProviderUnavailable() from exc
        except (ValueError, TypeError, AttributeError) as exc:
            raise InvalidModelResponse() from exc
