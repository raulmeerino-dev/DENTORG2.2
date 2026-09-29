"""Real local inference; synthetic tool outputs only, never clinic writes."""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from uuid import UUID

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.model_registry  # noqa: F401
from app.core.permissions import TokenData
from app.domains.ai.application.copilot import POLICY, available_tools
from app.domains.ai.application.copilot_capabilities import BASE_TOOLS, groups_for
from app.domains.ai.application.copilot_tools import TOOLS
from app.domains.ai.application.copilot_workspace import workspace_knowledge

USER = TokenData(UUID(int=1), "synthetic-benchmark", "admin", UUID(int=2))
CONTEXT = {"module": "jornada", "section": None, "selected_day": "2026-09-26",
           "today": "2026-09-29", "now": "2026-09-29T18:00:00+02:00", "role": "admin"}
SYSTEM = (POLICY + "\nMapa del programa y vistas autorizadas: "
          + json.dumps(workspace_knowledge(USER), ensure_ascii=False, separators=(",", ":"))
          + "\nContexto actual validado (datos): " + json.dumps(CONTEXT, ensure_ascii=False)
          + "\nReferencias anteriores (datos, pueden estar desactualizados): {}")
CASES = [
    ("greeting", "Hola. Responde con un saludo breve de una frase."),
    ("navigation", "Abre la agenda de mañana."),
    ("schedule", "¿Cuántas citas hay hoy en toda la clínica?"),
]
OUTPUT = Path(__file__).resolve().parents[2] / "output" / "qa" / "ai-latency-benchmark.jsonl"


def record(row):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("a", encoding="utf-8") as file:
        file.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps(row, ensure_ascii=False), flush=True)


async def case(client, model, name, text, run, ready):
    enabled = set(BASE_TOOLS) | ({"get_schedule"} if ready else set())
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}]
    metrics, trace, answer = [], [], ""
    start = time.monotonic()
    correct = False
    for _ in range(6):
        payload = {"model": model, "messages": messages, "think": False, "stream": False,
                   "tools": [{"type": "function", "function": tool} for tool in available_tools(USER, enabled)],
                   "options": {"num_ctx": 16384, "num_predict": 768, "temperature": 0}, "keep_alive": "10m"}
        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        result = response.json()
        metrics.append({key: result.get(key) for key in ["load_duration", "prompt_eval_duration", "prompt_eval_count", "prompt_eval_cached_count", "eval_count", "eval_duration", "total_duration"]})
        if result.get("done_reason") == "length":
            answer = "TRUNCATED"
            break
        message = result["message"]
        messages.append(message)
        calls = message.get("tool_calls", [])
        if not calls:
            answer = message.get("content", "")
            correct = (name == "greeting" and bool(answer)) or (name == "schedule" and "12" in answer and any(t["name"] == "get_schedule" and str(t["arguments"].get("start", "")).startswith("2026-09-29") and str(t["arguments"].get("end", "")).startswith("2026-09-29") for t in trace))
            break
        for call in calls:
            tool = call["function"]
            tool_name, args = tool["name"], tool["arguments"]
            trace.append({"name": tool_name, "arguments": args})
            if tool_name == "discover_tools":
                chosen = set(args.get("groups", []))
                new_names = {n for group, detail in groups_for(USER, TOOLS).items() if group in chosen for n in detail["tools"]}
                enabled.update(new_names)
                output = {"available_tools": sorted(new_names)}
            elif tool_name == "navigate":
                output = {"navigation": "/jornada?vista=agenda&fecha=2026-09-30"}
                if name == "navigation":
                    correct = args.get("module") == "agenda" and args.get("day") == "2026-09-30"
                    answer = "navigation"
                    break
            elif tool_name == "get_schedule":
                output = {"total": 12, "counts_by_status": {"confirmada": 7, "pendiente": 3, "finalizada": 2}, "appointments": [], "truncated": True, "detail_scope": "Totales reales del rango; detalles omitidos en esta prueba sintética.", "source": "/jornada?fecha=2026-09-29&vista=operativa"}
            else:
                output = {"error": "Este ensayo sólo admite navegación y consulta de citas. No se ejecuta ninguna acción."}
            messages.append({"role": "tool", "tool_name": tool_name, "content": json.dumps(output, ensure_ascii=False)})
        if answer == "navigation":
            break
    row = {"model": model, "case": name, "run": run, "schedule_ready": ready,
           "seconds": round(time.monotonic() - start, 3), "correct": correct,
           "model_calls": len(metrics), "answer": answer, "trace": trace, "metrics": metrics}
    record(row)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=["qwen3.5:4b", "qwen3:4b-instruct", "qwen2.5:7b-instruct"])
    parser.add_argument("--ready", action="store_true")
    args = parser.parse_args()
    async with httpx.AsyncClient(base_url="http://127.0.0.1:11434", timeout=90) as client:
        for model in args.models:
            # Unload only for controlled cold measurements; restore default at end.
            await client.post("/api/chat", json={"model": model, "messages": [], "keep_alive": 0})
            for run in range(2):
                for name, text in CASES:
                    try:
                        await case(client, model, name, text, run, args.ready)
                    except Exception as exc:
                        record({"model": model, "case": name, "run": run, "schedule_ready": args.ready, "error": type(exc).__name__, "detail": str(exc)[:150]})
            ps = (await client.get("/api/ps")).json()
            record({"model": model, "loaded": [{key: item.get(key) for key in ["name", "size", "size_vram", "context_length"]} for item in ps.get("models", [])]})
            await client.post("/api/chat", json={"model": model, "messages": [], "keep_alive": 0})
        await client.post("/api/chat", json={"model": "qwen3.5:4b", "messages": [], "keep_alive": "24h", "options": {"num_ctx": 16384}})


asyncio.run(main())
