from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.schemas.assistant import DraftPatch, DraftPatchInterpretRequest
from app.services.assistant_llm_interpreter import AssistantLLMError, AssistantLLMNotConfigured

DRAFT_PATCH_ACTIONS = [
    "update_fields",
    "clear_fields",
    "select_option",
    "confirm",
    "cancel",
    "start_new",
    "ask_clarification",
    "unknown",
]

DRAFT_PATCH_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "action": {"type": "string", "enum": DRAFT_PATCH_ACTIONS},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "updates": {
            "type": ["object", "null"],
            "additionalProperties": False,
            "properties": {
                "patientQuery": {"type": ["string", "null"]},
                "patientId": {"type": ["string", "null"]},
                "professionalQuery": {"type": ["string", "null"]},
                "professionalId": {"type": ["string", "null"]},
                "treatmentType": {"type": ["string", "null"]},
                "dateRange": {"type": ["string", "null"]},
                "preferredDate": {"type": ["string", "null"]},
                "preferredTime": {"type": ["string", "null"]},
                "timePreference": {
                    "type": ["string", "null"],
                    "enum": ["morning", "afternoon", "first_available", "last_available", None],
                },
                "durationMinutes": {"type": ["integer", "null"]},
                "selectedSlotIndex": {"type": ["integer", "null"]},
                "taskText": {"type": ["string", "null"]},
                "noteText": {"type": ["string", "null"]},
                "amount": {"type": ["number", "null"]},
                "budgetLines": {
                    "type": ["array", "null"],
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "treatmentQuery": {"type": ["string", "null"]},
                            "treatmentId": {"type": ["string", "null"]},
                            "description": {"type": ["string", "null"]},
                            "tooth": {"type": ["string", "null"]},
                            "quantity": {"type": ["integer", "null"]},
                            "unitPrice": {"type": ["number", "null"]},
                            "discount": {"type": ["number", "null"]},
                            "total": {"type": ["number", "null"]},
                        },
                        "required": [
                            "treatmentQuery",
                            "treatmentId",
                            "description",
                            "tooth",
                            "quantity",
                            "unitPrice",
                            "discount",
                            "total",
                        ],
                    },
                },
                "budgetStatus": {
                    "type": ["string", "null"],
                    "enum": ["draft", "pending", "accepted", "rejected", "cancelled", None],
                },
            },
            "required": [
                "patientQuery",
                "patientId",
                "professionalQuery",
                "professionalId",
                "treatmentType",
                "dateRange",
                "preferredDate",
                "preferredTime",
                "timePreference",
                "durationMinutes",
                "selectedSlotIndex",
                "taskText",
                "noteText",
                "amount",
                "budgetLines",
                "budgetStatus",
            ],
        },
        "clearFields": {"type": "array", "items": {"type": "string"}},
        "clarificationQuestion": {"type": ["string", "null"]},
        "spokenSummary": {"type": "string"},
    },
    "required": ["action", "confidence", "updates", "clearFields", "clarificationQuestion", "spokenSummary"],
}

DRAFT_PATCH_SYSTEM_PROMPT = """
Eres un interprete de edicion de borradores para DentCore, una app de gestion dental.

Tu tarea es leer lo que dice el usuario y convertirlo en un parche estructurado sobre el borrador actual.

No generes una accion nueva completa salvo que el usuario lo pida claramente.
No uses reglas por palabras clave.
No inventes IDs.
No borres campos que el usuario no haya cambiado.
No confirmes si el borrador tiene campos faltantes criticos.
No ejecutes acciones.
No devuelvas texto fuera del JSON.

Debes entender correcciones naturales aunque esten formuladas de muchas formas distintas.

Ejemplos conceptuales:
- Si el usuario cambia paciente, devuelve updates.patientQuery.
- Si cambia profesional, devuelve updates.professionalQuery.
- Si cambia tratamiento, devuelve updates.treatmentType.
- Si cambia fecha u hora, devuelve preferredDate, dateRange, preferredTime o timePreference.
- Si elige una opcion visible, devuelve selectedSlotIndex o el identificador correspondiente.
- Si confirma, devuelve action = "confirm".
- Si cancela, devuelve action = "cancel".
- Si quiere empezar otra cosa, devuelve action = "start_new".
- Si no esta claro, devuelve action = "ask_clarification".
- Si el borrador actual es un presupuesto y el usuario anade, quita o cambia tratamientos, devuelve
  action = "update_fields" y updates.budgetLines con la lista completa resultante. No uses campos de cita.
- En presupuestos, "quita la del 23" elimina la linea de la pieza 23, "anade una limpieza" conserva las lineas
  anteriores y anade limpieza, y "cambia endodoncia por empaste" cambia treatmentQuery manteniendo piezas si aplica.

Importante:
Los ejemplos no son reglas literales. Debes razonar por significado.
"""


class DraftPatchInterpreter:
    def __init__(self, settings: Settings):
        self.api_key = settings.openai_api_key.strip()
        self.model = settings.openai_model.strip()
        self.timeout = settings.openai_timeout_seconds
        self.endpoint = settings.openai_responses_endpoint.strip() or "https://api.openai.com/v1/responses"

    async def interpret(self, request: DraftPatchInterpretRequest) -> DraftPatch:
        if not self.api_key or not self.model:
            raise AssistantLLMNotConfigured("Interprete de patches no configurado")

        payload = self._build_request_payload(request)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            response.raise_for_status()
            response_payload = response.json()
        except httpx.TimeoutException as exc:
            raise AssistantLLMError("Tiempo de espera agotado al interpretar la correccion") from exc
        except httpx.HTTPStatusError as exc:
            raise AssistantLLMError(f"Error del proveedor LLM ({exc.response.status_code})") from exc
        except httpx.HTTPError as exc:
            raise AssistantLLMError("No se pudo conectar con el proveedor LLM") from exc
        except ValueError as exc:
            raise AssistantLLMError("Respuesta invalida del proveedor LLM") from exc

        raw_text = self._extract_output_text(response_payload)
        try:
            parsed = json.loads(raw_text)
            return DraftPatch.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise AssistantLLMError("El proveedor LLM devolvio un patch invalido") from exc

    def _build_request_payload(self, request: DraftPatchInterpretRequest) -> dict[str, Any]:
        safe_input = {
            "userText": request.user_text,
            "currentDraft": request.current_draft.model_dump(by_alias=True),
            "safeContext": request.safe_context.model_dump(by_alias=True),
            "lastAssistantQuestion": request.last_assistant_question,
            "visibleOptions": request.visible_options.model_dump(by_alias=True),
        }
        return {
            "model": self.model,
            "store": False,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": DRAFT_PATCH_SYSTEM_PROMPT}]},
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": json.dumps(safe_input, ensure_ascii=False)}],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "dentcore_draft_patch",
                    "strict": True,
                    "schema": DRAFT_PATCH_JSON_SCHEMA,
                },
            },
        }

    def _extract_output_text(self, payload: dict[str, Any]) -> str:
        if isinstance(payload.get("output_text"), str):
            return payload["output_text"]
        for item in payload.get("output", []):
            for content in item.get("content", []):
                if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                    return content["text"]
        raise AssistantLLMError("El proveedor LLM no devolvio texto estructurado")


async def interpret_draft_patch(
    request: DraftPatchInterpretRequest,
    settings: Settings,
) -> DraftPatch:
    return await DraftPatchInterpreter(settings).interpret(request)
