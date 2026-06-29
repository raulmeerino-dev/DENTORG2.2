from __future__ import annotations

import json
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass
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


class AssistantLLMUnavailable(AssistantLLMError):
    pass


class AssistantLLMUnsafeResponse(AssistantLLMError):
    pass


logger = logging.getLogger(__name__)

OLLAMA_UNAVAILABLE_MESSAGE = (
    "Ollama no está ejecutándose. Instálalo y ejecuta: "
    "ollama pull qwen2.5:14b-instruct"
)
NO_LLM_ENGINE_MESSAGE = "No hay motor de IA disponible. Revisa Ollama u OpenAI."

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

# Ollama and OpenAI intentionally share the same AssistantIntent contract.
OLLAMA_INTENT_JSON_SCHEMA = ASSISTANT_INTENT_JSON_SCHEMA

SYSTEM_PROMPT = """
Eres el interprete semantico del asistente de voz de DentCore, una app de gestion de clinica dental.

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
dado explicitamente un precio o descuento. DentCore resolvera catalogo y totales.

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

def _provider_from_settings(settings: Settings) -> str:
    return settings.llm_provider.strip().lower() or "auto"


def _fallback_order_from_settings(settings: Settings) -> list[str]:
    supported = {"ollama", "openai", "mock"}
    order = [
        item.strip().lower()
        for item in settings.llm_fallback_order.split(",")
        if item.strip().lower() in supported
    ]
    return order or ["ollama", "openai", "mock"]


def _ollama_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _minimal_draft(request: AssistantInterpretRequest) -> dict[str, Any] | None:
    if not request.current_draft:
        return None
    draft = request.current_draft.model_dump(by_alias=True)
    return {
        "intent": draft.get("intent"),
        "confidence": draft.get("confidence"),
        "status": draft.get("status"),
        "fields": draft.get("fields"),
        "missingFields": draft.get("missingFields"),
        "needsClarification": draft.get("needsClarification"),
        "clarificationQuestion": draft.get("clarificationQuestion"),
        "requiresConfirmation": draft.get("requiresConfirmation"),
        "riskLevel": draft.get("riskLevel"),
        "spokenSummary": draft.get("spokenSummary"),
    }


def build_safe_intent_input(request: AssistantInterpretRequest) -> dict[str, Any]:
    return {
        "userText": request.user_text,
        "safeContext": request.context.model_dump(by_alias=True),
        "currentDraft": _minimal_draft(request),
        "lastAssistantQuestion": request.last_assistant_question,
        "availableActions": AVAILABLE_ACTIONS,
    }


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for index, char in enumerate(stripped):
        if char != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(stripped[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed

    raise AssistantLLMUnsafeResponse("El proveedor LLM no devolvio JSON seguro")


def _log_interpreter_result(provider: str, model: str, raw_text: str, parsed: Mapping[str, Any], intent: AssistantIntentPayload) -> None:
    logger.debug("DentCore assistant LLM provider usado: %s", provider)
    logger.debug("DentCore assistant LLM modelo usado: %s", model)
    logger.debug("DentCore assistant LLM respuesta cruda: %s", raw_text)
    logger.debug("DentCore assistant LLM JSON parseado: %s", dict(parsed))
    logger.debug("DentCore assistant LLM intent final: %s", intent.model_dump(by_alias=True))


@dataclass(frozen=True)
class ProviderHealth:
    available: bool
    model: str
    message: str


@dataclass(frozen=True)
class AssistantIntentInterpretation:
    intent: AssistantIntentPayload
    provider: str
    model: str
    response_ms: float

    def debug_payload(self) -> dict[str, Any]:
        return {
            "route": f"llm/{self.provider}",
            "providerUsed": self.provider,
            "modelUsed": self.model,
            "responseMs": self.response_ms,
            "intentFinal": self.intent.intent,
        }


class LLMProviderManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.mode = _provider_from_settings(settings)
        self.fallback_order = _fallback_order_from_settings(settings)

    async def check_ollama(self) -> ProviderHealth:
        base_url = self.settings.ollama_base_url.strip().rstrip("/")
        model = self.settings.ollama_model.strip()
        if not base_url or not model:
            return ProviderHealth(
                available=False,
                model=model,
                message="Ollama no esta configurado: revisa OLLAMA_BASE_URL y OLLAMA_MODEL.",
            )

        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(_ollama_url(base_url, "/api/tags"))
            response.raise_for_status()
            payload = response.json()
        except (httpx.TimeoutException, httpx.HTTPError, ValueError):
            return ProviderHealth(available=False, model=model, message=OLLAMA_UNAVAILABLE_MESSAGE)

        models = payload.get("models", [])
        names = {
            item.get("name") or item.get("model")
            for item in models
            if isinstance(item, dict) and (item.get("name") or item.get("model"))
        }
        if model in names:
            return ProviderHealth(available=True, model=model, message=f"Ollama disponible con el modelo {model}.")
        return ProviderHealth(
            available=False,
            model=model,
            message=f"Ollama responde, pero falta el modelo {model}. Ejecuta: ollama pull {model}",
        )

    def check_openai(self) -> ProviderHealth:
        model = self.settings.openai_model.strip()
        if self.settings.openai_api_key.strip() and model:
            return ProviderHealth(available=True, model=model, message=f"OpenAI configurado con el modelo {model}.")
        return ProviderHealth(
            available=False,
            model=model,
            message="OpenAI no esta configurado: revisa OPENAI_API_KEY y OPENAI_MODEL.",
        )

    async def health(self) -> dict[str, Any]:
        ollama = await self.check_ollama()
        openai = self.check_openai()
        active_provider = self._active_provider_from_health(ollama, openai)
        return {
            "mode": self.mode,
            "activeProvider": active_provider,
            "ollama": {
                "available": ollama.available,
                "model": ollama.model,
                "message": ollama.message,
            },
            "openai": {
                "available": openai.available,
                "model": openai.model,
                "message": openai.message,
            },
        }

    def _active_provider_from_health(self, ollama: ProviderHealth, openai: ProviderHealth) -> str:
        if self.mode == "ollama":
            return "ollama" if ollama.available else "none"
        if self.mode == "openai":
            return "openai" if openai.available else "none"
        if self.mode != "auto":
            return "none"

        for provider in self.fallback_order:
            if provider == "ollama" and ollama.available:
                return "ollama"
            if provider == "openai" and openai.available:
                return "openai"
            if provider == "mock":
                return "mock"
        return "none"

    async def ordered_available_providers(self) -> list[str]:
        if self.mode == "ollama":
            return ["ollama"]
        if self.mode == "openai":
            return ["openai"]
        if self.mode != "auto":
            return []

        providers: list[str] = []
        ollama_health: ProviderHealth | None = None
        openai_health: ProviderHealth | None = None
        for provider in self.fallback_order:
            if provider == "ollama":
                ollama_health = ollama_health or await self.check_ollama()
                if ollama_health.available:
                    providers.append("ollama")
                else:
                    logger.debug("DentCore assistant LLM Ollama no disponible: %s", ollama_health.message)
            elif provider == "openai":
                openai_health = openai_health or self.check_openai()
                if openai_health.available:
                    providers.append("openai")
                else:
                    logger.debug("DentCore assistant LLM OpenAI no disponible: %s", openai_health.message)
            elif provider == "mock":
                logger.debug("DentCore assistant LLM fallback mock configurado en backend; lo resolvera el cliente si procede.")
        return providers

    def log_selected_provider(self, provider: str) -> None:
        if provider == "ollama":
            logger.debug("DentCore assistant LLM provider seleccionado: ollama, modelo: %s", self.settings.ollama_model)
        elif provider == "openai":
            logger.debug(
                "DentCore assistant LLM provider seleccionado: openai, modelo: %s. ATENCION DEV: proveedor externo.",
                self.settings.openai_model,
            )


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
            parsed = extract_json_object(raw_text)
            intent = AssistantIntentPayload.model_validate(parsed)
            _log_interpreter_result("openai", self.model, raw_text, parsed, intent)
            return intent
        except AssistantLLMUnsafeResponse:
            raise
        except ValidationError as exc:
            raise AssistantLLMError("El proveedor LLM devolvio una intencion invalida") from exc

    def _build_request_payload(self, request: AssistantInterpretRequest) -> dict[str, Any]:
        safe_input = build_safe_intent_input(request)
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
                    "name": "dentcore_assistant_intent",
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


class OllamaIntentInterpreter:
    def __init__(self, settings: Settings):
        self.base_url = settings.ollama_base_url.strip().rstrip("/")
        self.model = settings.ollama_model.strip()
        self.timeout = settings.ollama_timeout_seconds

    async def interpret(self, request: AssistantInterpretRequest) -> AssistantIntentPayload:
        if not self.base_url or not self.model:
            raise AssistantLLMNotConfigured("Interprete Ollama no configurado")

        payload = self._build_request_payload(request)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(_ollama_url(self.base_url, "/api/chat"), json=payload)
            response.raise_for_status()
            response_payload = response.json()
        except httpx.TimeoutException as exc:
            raise AssistantLLMUnavailable(OLLAMA_UNAVAILABLE_MESSAGE) from exc
        except httpx.HTTPStatusError as exc:
            raise AssistantLLMError(f"Error de Ollama ({exc.response.status_code})") from exc
        except httpx.HTTPError as exc:
            raise AssistantLLMUnavailable(OLLAMA_UNAVAILABLE_MESSAGE) from exc
        except ValueError as exc:
            raise AssistantLLMError("Respuesta invalida de Ollama") from exc

        raw_text = self._extract_output_text(response_payload)
        try:
            parsed = extract_json_object(raw_text)
            intent = AssistantIntentPayload.model_validate(parsed)
            _log_interpreter_result("ollama", self.model, raw_text, parsed, intent)
            if intent.intent == "unknown":
                logger.warning("DentCore assistant Ollama devolvio unknown. userText=%r respuesta cruda: %s", request.user_text, raw_text)
            return intent
        except AssistantLLMUnsafeResponse:
            logger.warning("DentCore assistant Ollama respuesta cruda no JSON AssistantIntent: %s", raw_text)
            raise
        except ValidationError as exc:
            logger.warning("DentCore assistant Ollama JSON invalido. respuesta cruda: %s", raw_text)
            raise AssistantLLMError("Ollama devolvio una intencion invalida") from exc

    def _build_request_payload(self, request: AssistantInterpretRequest) -> dict[str, Any]:
        safe_input = build_safe_intent_input(request)
        return {
            "model": self.model,
            "stream": False,
            "format": OLLAMA_INTENT_JSON_SCHEMA,
            "options": {"temperature": 0},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Devuelve exclusivamente un objeto JSON compatible con el schema AssistantIntent configurado. "
                        f"Entrada segura: {json.dumps(safe_input, ensure_ascii=False)}"
                    ),
                },
            ],
        }

    def _extract_output_text(self, payload: dict[str, Any]) -> str:
        message = payload.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]
        if isinstance(payload.get("response"), str):
            return payload["response"]
        raise AssistantLLMError("Ollama no devolvio texto estructurado")


async def check_llm_health(settings: Settings) -> dict[str, Any]:
    return await LLMProviderManager(settings).health()


def _model_for_provider(provider: str, settings: Settings) -> str:
    if provider == "ollama":
        return settings.ollama_model.strip()
    if provider == "openai":
        return settings.openai_model.strip()
    return "mock"


async def _interpret_with_provider(
    provider: str,
    request: AssistantInterpretRequest,
    settings: Settings,
) -> AssistantIntentInterpretation:
    started_at = time.perf_counter()
    if provider == "ollama":
        intent = await OllamaIntentInterpreter(settings).interpret(request)
    elif provider == "openai":
        intent = await LLMIntentInterpreter(settings).interpret(request)
    else:
        raise AssistantLLMNotConfigured("Proveedor LLM no soportado")
    response_ms = round((time.perf_counter() - started_at) * 1000, 2)
    return AssistantIntentInterpretation(
        intent=intent,
        provider=provider,
        model=_model_for_provider(provider, settings),
        response_ms=response_ms,
    )


async def interpret_assistant_intent_with_debug(
    request: AssistantInterpretRequest,
    settings: Settings,
) -> AssistantIntentInterpretation:
    manager = LLMProviderManager(settings)
    if manager.mode == "ollama":
        manager.log_selected_provider("ollama")
        return await _interpret_with_provider("ollama", request, settings)
    if manager.mode == "openai":
        manager.log_selected_provider("openai")
        return await _interpret_with_provider("openai", request, settings)
    if manager.mode != "auto":
        raise AssistantLLMNotConfigured("Interprete LLM no configurado")

    errors: list[str] = []
    for provider in await manager.ordered_available_providers():
        try:
            manager.log_selected_provider(provider)
            return await _interpret_with_provider(provider, request, settings)
        except AssistantLLMError as exc:
            errors.append(f"{provider}: {exc}")
            logger.debug("DentCore assistant LLM fallo en proveedor %s: %s", provider, exc)
            continue

    logger.debug("DentCore assistant LLM sin proveedor disponible. Fallos: %s", errors)
    raise AssistantLLMUnavailable(NO_LLM_ENGINE_MESSAGE)


async def interpret_assistant_intent(
    request: AssistantInterpretRequest,
    settings: Settings,
) -> AssistantIntentPayload:
    return (await interpret_assistant_intent_with_debug(request, settings)).intent
