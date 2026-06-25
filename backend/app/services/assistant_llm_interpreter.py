from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.schemas.assistant import (
    AssistantIntentPayload,
    AssistantInterpretRequest,
)


class AssistantLLMNotConfigured(Exception):
    pass


class AssistantLLMError(Exception):
    pass


ALLOWED_INTENTS = [
    "open_patient_profile",
    "search_patient",
    "show_today_schedule",
    "show_schedule_by_date",
    "find_available_slots",
    "create_appointment",
    "move_appointment",
    "cancel_appointment",
    "create_task",
    "show_patient_pending_items",
    "create_budget_draft",
    "update_budget_draft",
    "register_payment_draft",
    "create_clinical_note_draft",
    "cancel_current_draft",
    "confirm_current_draft",
    "unknown",
]

AVAILABLE_ACTIONS = [
    {"intent": "open_patient_profile", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "search_patient", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "show_today_schedule", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "show_schedule_by_date", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "find_available_slots", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "create_appointment", "riskLevel": "medium", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "move_appointment", "riskLevel": "medium", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "cancel_appointment", "riskLevel": "high", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "create_task", "riskLevel": "medium", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "show_patient_pending_items", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "create_budget_draft", "riskLevel": "high", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "update_budget_draft", "riskLevel": "high", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "register_payment_draft", "riskLevel": "high", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "create_clinical_note_draft", "riskLevel": "high", "requiresConfirmation": True, "mutatesData": True},
    {"intent": "cancel_current_draft", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "confirm_current_draft", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
    {"intent": "unknown", "riskLevel": "low", "requiresConfirmation": False, "mutatesData": False},
]

ASSISTANT_INTENT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "intent": {"type": "string", "enum": ALLOWED_INTENTS},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "status": {
            "type": "string",
            "enum": ["ready", "draft", "needs_clarification", "awaiting_confirmation", "cancelled", "error"],
        },
        "fields": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "patientId": {"type": ["string", "null"]},
                "patientQuery": {"type": ["string", "null"]},
                "professionalId": {"type": ["string", "null"]},
                "professionalQuery": {"type": ["string", "null"]},
                "treatmentType": {"type": ["string", "null"]},
                "dateRange": {"type": ["string", "null"]},
                "preferredDate": {"type": ["string", "null"]},
                "preferredTime": {"type": ["string", "null"]},
                "timePreference": {
                    "type": ["string", "null"],
                    "enum": ["morning", "afternoon", "first_available", "last_available", None],
                },
                "durationMinutes": {"type": ["integer", "null"]},
                "appointmentId": {"type": ["string", "null"]},
                "taskText": {"type": ["string", "null"]},
                "noteText": {"type": ["string", "null"]},
                "amount": {"type": ["number", "null"]},
                "selectedSlotIndex": {"type": ["integer", "null"]},
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
                "patientId",
                "patientQuery",
                "professionalId",
                "professionalQuery",
                "treatmentType",
                "dateRange",
                "preferredDate",
                "preferredTime",
                "timePreference",
                "durationMinutes",
                "appointmentId",
                "taskText",
                "noteText",
                "amount",
                "selectedSlotIndex",
                "budgetLines",
                "budgetStatus",
            ],
        },
        "missingFields": {"type": "array", "items": {"type": "string"}},
        "needsClarification": {"type": "boolean"},
        "clarificationQuestion": {"type": ["string", "null"]},
        "requiresConfirmation": {"type": "boolean"},
        "riskLevel": {"type": "string", "enum": ["low", "medium", "high"]},
        "spokenSummary": {"type": "string"},
    },
    "required": [
        "intent",
        "confidence",
        "status",
        "fields",
        "missingFields",
        "needsClarification",
        "clarificationQuestion",
        "requiresConfirmation",
        "riskLevel",
        "spokenSummary",
    ],
}

SYSTEM_PROMPT = """
Eres el interprete semantico del asistente de voz de DentOrg, una app de gestion de clinica dental.

Tu unica tarea es convertir el texto del usuario en una intencion estructurada JSON compatible con el schema AssistantIntent.
No respondas en lenguaje natural fuera del JSON.

No ejecutes acciones. No inventes datos. No inventes patientId ni professionalId si no vienen dados en contexto o resolvers.
No accedas a base de datos. No diagnostiques. No des consejo medico. No guardes datos clinicos. No pidas mas datos de los necesarios.

Debes interpretar lenguaje natural para crear una primera intencion estructurada cuando no hay borrador activo.
Si hay un currentDraft activo, no uses este interprete: la edicion de borradores se resuelve mediante DraftPatchInterpreter.

Primero clasifica semanticamente el tipo de accion antes de rellenar campos:
- cita / agenda
- presupuesto
- nota clinica
- nota interna
- tarea
- consulta / navegacion

No uses una tarjeta de cita como fallback para cualquier peticion. Si el usuario pide presupuesto, coste,
valoracion economica, "presu", "preparale presupuesto", "hazle presupuesto", "presupuesto para" o expresiones
equivalentes, la intencion debe ser create_budget_draft. En presupuestos no rellenes professionalQuery,
dateRange, preferredDate, preferredTime ni durationMinutes salvo que el usuario lo pida como dato aparte.

Para create_budget_draft usa fields.patientQuery/patientId y fields.budgetLines. Cada tratamiento presupuestado
debe ser una linea independiente. Si el usuario dice "una endodoncia en el 24 y otra en el 23",
"endodoncia en 24 y 23" o "dos endodoncias, 24 y 23", devuelve dos lineas con treatmentQuery="endodoncia"
y tooth="24"/"23". Si dice "implante en 46 y corona en 46", devuelve dos lineas. Si dice "limpieza y revision",
devuelve dos lineas sin pieza. quantity suele ser 1 si no se especifica.

No calcules precios ni totales desde el LLM: deja unitPrice, discount y total en null salvo que el usuario haya
dado explicitamente un precio o descuento. DentOrg resolvera catalogo y totales.

Si dice "Si, confirma", devuelve confirm_current_draft si el borrador esta completo; si faltan campos, needsClarification true.
Si dice "Cancela eso", devuelve cancel_current_draft.
Si pide crear, mover, cancelar o guardar algo, marca requiresConfirmation true salvo confirm_current_draft.

Cuando el usuario diga "dime que opciones hay", "dime que huecos hay", "mira huecos", "busca huecos" o expresiones similares, interpreta eso como solicitud de disponibilidad. No lo incluyas dentro de patientQuery, professionalQuery ni treatmentType.
En frases del tipo "cita a X para Y con Z", X es paciente, Y es tratamiento y Z es profesional. Si despues de Z aparece una clausula como "dime que opciones hay", esa clausula es una instruccion adicional, no parte del profesional.
Si el usuario no especifica fecha pero pide huecos/opciones, usa dateRange = "next_available".

Riesgo:
low = navegacion o consulta.
medium = crear/mover cita, crear tarea.
high = cancelar cita, pago, presupuesto, nota clinica, datos personales.

create_budget_draft y update_budget_draft siempre tienen riskLevel high y requiresConfirmation true.

Si confidence < 0.75 o hay ambiguedad, needsClarification true.
spokenSummary debe ser breve y operativo.
"""


class LLMIntentInterpreter:
    def __init__(self, settings: Settings):
        self.api_key = settings.openai_api_key.strip()
        self.model = settings.openai_model.strip()
        self.timeout = settings.openai_timeout_seconds
        self.endpoint = settings.openai_responses_endpoint.strip() or "https://api.openai.com/v1/responses"

    async def interpret(self, request: AssistantInterpretRequest) -> AssistantIntentPayload:
        if not self.api_key or not self.model:
            raise AssistantLLMNotConfigured("Interprete LLM no configurado")

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
            raise AssistantLLMError("Tiempo de espera agotado al interpretar la peticion") from exc
        except httpx.HTTPStatusError as exc:
            raise AssistantLLMError(f"Error del proveedor LLM ({exc.response.status_code})") from exc
        except httpx.HTTPError as exc:
            raise AssistantLLMError("No se pudo conectar con el proveedor LLM") from exc
        except ValueError as exc:
            raise AssistantLLMError("Respuesta invalida del proveedor LLM") from exc

        raw_text = self._extract_output_text(response_payload)
        try:
            parsed = json.loads(raw_text)
            return AssistantIntentPayload.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise AssistantLLMError("El proveedor LLM devolvio una intencion invalida") from exc

    def _build_request_payload(self, request: AssistantInterpretRequest) -> dict[str, Any]:
        safe_input = {
            "userText": request.user_text,
            "assistantContext": request.context.model_dump(by_alias=True),
            "currentDraft": request.current_draft.model_dump(by_alias=True) if request.current_draft else None,
            "lastAssistantQuestion": request.last_assistant_question,
            "allowedIntents": ALLOWED_INTENTS,
            "availableActions": AVAILABLE_ACTIONS,
        }
        return {
            "model": self.model,
            "store": False,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": json.dumps(safe_input, ensure_ascii=False)}],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "dentorg_assistant_intent",
                    "strict": True,
                    "schema": ASSISTANT_INTENT_JSON_SCHEMA,
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


async def interpret_assistant_intent(
    request: AssistantInterpretRequest,
    settings: Settings,
) -> AssistantIntentPayload:
    return await LLMIntentInterpreter(settings).interpret(request)
