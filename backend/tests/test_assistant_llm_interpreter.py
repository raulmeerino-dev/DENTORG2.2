import json
import logging

import pytest

from app.config import Settings
from app.schemas.assistant import AssistantInterpretRequest, DraftPatchInterpretRequest
from app.services.assistant_llm_interpreter import (
    ALLOWED_INTENTS,
    ASSISTANT_INTENT_JSON_SCHEMA,
    OLLAMA_INTENT_JSON_SCHEMA,
    SYSTEM_PROMPT,
    AssistantLLMUnsafeResponse,
    LLMIntentInterpreter,
    OllamaIntentInterpreter,
    check_llm_health,
    interpret_assistant_intent,
    interpret_assistant_intent_with_debug,
)
from app.services.draft_patch_interpreter import (
    DRAFT_PATCH_ACTIONS,
    DRAFT_PATCH_JSON_SCHEMA,
    DRAFT_PATCH_SYSTEM_PROMPT,
    DraftPatchInterpreter,
)


def test_llm_interpreter_payload_uses_structured_outputs_and_safe_context():
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "Busca a Carmen.",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
                "phone": "600000000",
                "email": "paciente@example.test",
            },
            "currentDraft": None,
            "lastAssistantQuestion": None,
        }
    )
    interpreter = LLMIntentInterpreter(Settings(openai_api_key="sk-test", openai_model="model-test"))

    payload = interpreter._build_request_payload(request)
    user_payload = payload["input"][1]["content"][0]["text"]

    assert payload["store"] is False
    assert payload["text"]["format"]["type"] == "json_schema"
    assert payload["text"]["format"]["strict"] is True
    assert "phone" not in user_payload
    assert "email" not in user_payload
    assert "safeContext" in user_payload
    assert "availableActions" in user_payload


def test_llm_prompt_separates_availability_clauses_from_entities():
    assert "dime que opciones hay" in SYSTEM_PROMPT
    assert "No lo incluyas dentro de patientQuery" in SYSTEM_PROMPT
    assert 'dateRange = "next_available"' in SYSTEM_PROMPT


def test_initial_intent_prompt_does_not_use_draft_patch_actions():
    assert "DraftPatchInterpreter" in SYSTEM_PROMPT
    assert "update_current_draft" not in ALLOWED_INTENTS
    assert "select_slot" not in ALLOWED_INTENTS
    assert "clear_field" not in ALLOWED_INTENTS


def test_llm_budget_prompt_and_schema_support_structured_budget_lines():
    fields_schema = ASSISTANT_INTENT_JSON_SCHEMA["properties"]["fields"]
    assert "create_budget_draft" in ALLOWED_INTENTS
    assert "update_budget_draft" in ALLOWED_INTENTS
    assert "budgetLines" in fields_schema["properties"]
    assert "budgetStatus" in fields_schema["properties"]
    assert "presu" in SYSTEM_PROMPT
    assert "Cada tratamiento presupuestado" in SYSTEM_PROMPT
    assert "No calcules precios ni totales" in SYSTEM_PROMPT


def test_draft_patch_interpreter_payload_uses_patch_schema_and_safe_options():
    request = DraftPatchInterpretRequest.model_validate(
        {
            "userText": "No, con Laura.",
            "safeContext": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_schedule"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
                "phone": "600000000",
            },
            "currentDraft": {
                "intent": "create_appointment",
                "confidence": 0.9,
                "status": "needs_clarification",
                "fields": {
                    "patientId": "patient-1",
                    "patientQuery": "Cesar",
                    "professionalId": None,
                    "professionalQuery": None,
                    "treatmentType": "Empaste",
                    "dateRange": "next_available",
                    "preferredDate": None,
                    "preferredTime": None,
                    "timePreference": None,
                    "durationMinutes": 30,
                    "appointmentId": None,
                    "taskText": None,
                    "noteText": None,
                    "amount": None,
                    "selectedSlotIndex": None,
                },
                "missingFields": ["professional", "slot"],
                "needsClarification": True,
                "clarificationQuestion": "Falta profesional.",
                "requiresConfirmation": True,
                "riskLevel": "medium",
                "spokenSummary": "Preparar cita.",
            },
            "lastAssistantQuestion": "Falta profesional.",
            "visibleOptions": {
                "professionals": [{"id": "doctor-laura", "displayName": "Laura Perez"}],
                "patients": [],
                "slots": [],
            },
        }
    )
    interpreter = DraftPatchInterpreter(Settings(openai_api_key="sk-test", openai_model="model-test"))

    payload = interpreter._build_request_payload(request)
    user_payload = payload["input"][1]["content"][0]["text"]

    assert payload["store"] is False
    assert payload["text"]["format"]["name"] == "dentcore_draft_patch"
    assert payload["text"]["format"]["strict"] is True
    assert "phone" not in user_payload
    assert "visibleOptions" not in user_payload
    assert "update_fields" in DRAFT_PATCH_ACTIONS


def test_draft_patch_prompt_is_semantic_not_literal_rules():
    assert "No uses reglas por palabras clave" in DRAFT_PATCH_SYSTEM_PROMPT
    assert "Los ejemplos no son reglas literales" in DRAFT_PATCH_SYSTEM_PROMPT
    assert 'action = "confirm"' in DRAFT_PATCH_SYSTEM_PROMPT


def test_draft_patch_schema_supports_budget_line_updates():
    updates_schema = DRAFT_PATCH_JSON_SCHEMA["properties"]["updates"]
    assert "budgetLines" in updates_schema["properties"]
    assert "budgetStatus" in updates_schema["properties"]
    assert "updates.budgetLines" in DRAFT_PATCH_SYSTEM_PROMPT


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
        self.status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeAsyncClient:
    last_post_url = None
    last_post_json = None
    next_post_payload = None
    next_get_payload = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, json=None, **kwargs):
        type(self).last_post_url = url
        type(self).last_post_json = json
        return FakeResponse(type(self).next_post_payload)

    async def get(self, url, **kwargs):
        return FakeResponse(type(self).next_get_payload)


@pytest.mark.asyncio
async def test_ollama_interpreter_uses_same_chat_json_schema_and_extracts_budget_intent(monkeypatch):
    ollama_expected = {
        "intent": "create_budget_draft",
        "confidence": 0.9,
        "status": "awaiting_confirmation",
        "fields": {
            "patientId": None,
            "patientQuery": "cesar gutierrez",
            "professionalId": None,
            "professionalQuery": None,
            "treatmentType": None,
            "dateRange": None,
            "preferredDate": None,
            "preferredTime": None,
            "timePreference": None,
            "durationMinutes": None,
            "appointmentId": None,
            "taskText": None,
            "noteText": None,
            "amount": None,
            "selectedSlotIndex": None,
            "budgetLines": [
                {
                    "treatmentQuery": "endodoncia",
                    "treatmentId": None,
                    "description": None,
                    "tooth": "24",
                    "quantity": 1,
                    "unitPrice": None,
                    "discount": None,
                    "total": None,
                },
                {
                    "treatmentQuery": "endodoncia",
                    "treatmentId": None,
                    "description": None,
                    "tooth": "23",
                    "quantity": 1,
                    "unitPrice": None,
                    "discount": None,
                    "total": None,
                },
            ],
            "budgetStatus": "draft",
        },
        "missingFields": [],
        "needsClarification": False,
        "clarificationQuestion": None,
        "requiresConfirmation": True,
        "riskLevel": "high",
        "spokenSummary": "Presupuesto en borrador para Cesar Gutierrez.",
    }
    FakeAsyncClient.next_post_payload = {
        "message": {"role": "assistant", "content": f"JSON:\n{json.dumps(ollama_expected)}\nfin"}
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "hazme un presu para cesar gutierrez de una endodoncia en el 24 y otra en el 23",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients", "budget:create"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
                "phone": "600000000",
                "email": "paciente@example.test",
            },
            "currentDraft": None,
            "lastAssistantQuestion": None,
        }
    )

    intent = await OllamaIntentInterpreter(
        Settings(
            llm_provider="ollama",
            ollama_base_url="http://127.0.0.1:11434",
            ollama_model="qwen2.5:14b-instruct",
        )
    ).interpret(request)

    assert FakeAsyncClient.last_post_url == "http://127.0.0.1:11434/api/chat"
    assert FakeAsyncClient.last_post_json["model"] == "qwen2.5:14b-instruct"
    assert FakeAsyncClient.last_post_json["stream"] is False
    assert FakeAsyncClient.last_post_json["format"] == OLLAMA_INTENT_JSON_SCHEMA
    assert FakeAsyncClient.last_post_json["format"] == ASSISTANT_INTENT_JSON_SCHEMA
    assert FakeAsyncClient.last_post_json["messages"][0]["content"] == SYSTEM_PROMPT
    user_content = FakeAsyncClient.last_post_json["messages"][1]["content"]
    assert "safeContext" in user_content
    assert "availableActions" in user_content
    assert "phone" not in user_content
    assert "email" not in user_content
    assert intent.intent == "create_budget_draft"
    assert intent.fields.patient_query == "cesar gutierrez"
    assert [line.treatment_query for line in intent.fields.budget_lines or []] == ["endodoncia", "endodoncia"]
    assert [line.tooth for line in intent.fields.budget_lines or []] == ["24", "23"]
    assert intent.fields.treatment_type is None
    assert intent.needs_clarification is False
    assert intent.status == "awaiting_confirmation"
    assert intent.fields.professional_query is None
    assert intent.fields.date_range is None
    assert intent.fields.duration_minutes is None


@pytest.mark.asyncio
async def test_provider_selector_uses_ollama(monkeypatch):
    FakeAsyncClient.next_post_payload = {
        "message": {
            "role": "assistant",
            "content": json.dumps(
                {
                    "intent": "search_patient",
                    "confidence": 0.9,
                    "status": "ready",
                    "fields": {
                        "patientId": None,
                        "patientQuery": "Carmen",
                        "professionalId": None,
                        "professionalQuery": None,
                        "treatmentType": None,
                        "dateRange": None,
                        "preferredDate": None,
                        "preferredTime": None,
                        "timePreference": None,
                        "durationMinutes": None,
                        "appointmentId": None,
                        "taskText": None,
                        "noteText": None,
                        "amount": None,
                        "selectedSlotIndex": None,
                        "budgetLines": None,
                        "budgetStatus": None,
                    },
                    "missingFields": [],
                    "needsClarification": False,
                    "clarificationQuestion": None,
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                    "spokenSummary": "Buscar Carmen.",
                }
            ),
        }
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "Busca a Carmen.",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
            },
        }
    )

    settings = Settings(llm_provider="ollama", ollama_model="qwen2.5:14b-instruct")
    intent = await interpret_assistant_intent(request, settings)

    assert intent.intent == "search_patient"
    assert FakeAsyncClient.last_post_json["model"] == settings.ollama_model


@pytest.mark.asyncio
async def test_provider_selector_returns_debug_metadata_for_openai_fallback(monkeypatch):
    FakeAsyncClient.next_get_payload = {"models": []}
    FakeAsyncClient.next_post_payload = {
        "output_text": json.dumps(
            {
                "intent": "create_budget_draft",
                "confidence": 0.91,
                "status": "awaiting_confirmation",
                "fields": {
                    "patientId": None,
                    "patientQuery": "Cesar",
                    "professionalId": None,
                    "professionalQuery": None,
                    "treatmentType": None,
                    "dateRange": None,
                    "preferredDate": None,
                    "preferredTime": None,
                    "timePreference": None,
                    "durationMinutes": None,
                    "appointmentId": None,
                    "taskText": None,
                    "noteText": None,
                    "amount": None,
                    "selectedSlotIndex": None,
                    "budgetLines": [
                        {
                            "treatmentQuery": "endodoncia",
                            "treatmentId": None,
                            "description": None,
                            "tooth": "24",
                            "quantity": 1,
                            "unitPrice": None,
                            "discount": None,
                            "total": None,
                        }
                    ],
                    "budgetStatus": "draft",
                },
                "missingFields": [],
                "needsClarification": False,
                "clarificationQuestion": None,
                "requiresConfirmation": True,
                "riskLevel": "high",
                "spokenSummary": "Presupuesto en borrador.",
            }
        )
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "haz presupuesto para Cesar de endodoncia en 24",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients", "budget:create"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
            },
        }
    )

    result = await interpret_assistant_intent_with_debug(
        request,
        Settings(
            llm_provider="auto",
            llm_fallback_order="ollama,openai,mock",
            openai_api_key="sk-test",
            openai_model="gpt-test",
        ),
    )

    assert result.intent.intent == "create_budget_draft"
    assert result.provider == "openai"
    assert result.model == "gpt-test"
    assert result.debug_payload()["route"] == "llm/openai"
    assert result.debug_payload()["intentFinal"] == "create_budget_draft"


@pytest.mark.asyncio
async def test_ollama_logs_raw_response_when_json_is_not_assistant_intent(monkeypatch, caplog):
    FakeAsyncClient.next_post_payload = {
        "message": {"role": "assistant", "content": "Claro, voy a buscar a Carmen."}
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    caplog.set_level(logging.WARNING, logger="app.services.assistant_llm_interpreter")
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "Busca a Carmen.",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
            },
        }
    )

    with pytest.raises(AssistantLLMUnsafeResponse):
        await OllamaIntentInterpreter(Settings(llm_provider="ollama")).interpret(request)

    assert "respuesta cruda no JSON AssistantIntent" in caplog.text
    assert "Claro, voy a buscar a Carmen." in caplog.text


@pytest.mark.asyncio
async def test_ollama_logs_raw_response_when_unknown(monkeypatch, caplog):
    FakeAsyncClient.next_post_payload = {
        "message": {
            "role": "assistant",
            "content": json.dumps(
                {
                    "intent": "unknown",
                    "confidence": 0.2,
                    "status": "needs_clarification",
                    "fields": {
                        "patientId": None,
                        "patientQuery": None,
                        "professionalId": None,
                        "professionalQuery": None,
                        "treatmentType": None,
                        "dateRange": None,
                        "preferredDate": None,
                        "preferredTime": None,
                        "timePreference": None,
                        "durationMinutes": None,
                        "appointmentId": None,
                        "taskText": None,
                        "noteText": None,
                        "amount": None,
                        "selectedSlotIndex": None,
                        "budgetLines": None,
                        "budgetStatus": None,
                    },
                    "missingFields": [],
                    "needsClarification": True,
                    "clarificationQuestion": "No interpretado.",
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                    "spokenSummary": "No interpretado.",
                }
            ),
        }
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    caplog.set_level(logging.WARNING, logger="app.services.assistant_llm_interpreter")
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "Busca a Carmen.",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
            },
        }
    )

    intent = await OllamaIntentInterpreter(Settings(llm_provider="ollama")).interpret(request)

    assert intent.intent == "unknown"
    assert "Ollama devolvio unknown" in caplog.text
    assert "respuesta cruda" in caplog.text


@pytest.mark.asyncio
async def test_llm_health_reports_ollama_model_availability(monkeypatch):
    FakeAsyncClient.next_get_payload = {"models": [{"name": "qwen2.5:14b-instruct"}]}
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)

    health = await check_llm_health(
        Settings(
            llm_provider="ollama",
            ollama_base_url="http://127.0.0.1:11434",
            ollama_model="qwen2.5:14b-instruct",
        )
    )

    assert health == {
        "mode": "ollama",
        "activeProvider": "ollama",
        "ollama": {
            "available": True,
            "model": "qwen2.5:14b-instruct",
            "message": "Ollama disponible con el modelo qwen2.5:14b-instruct.",
        },
        "openai": {
            "available": False,
            "model": "gpt-4o-mini",
            "message": "OpenAI no esta configurado: revisa OPENAI_API_KEY y OPENAI_MODEL.",
        },
    }


@pytest.mark.asyncio
async def test_auto_provider_falls_back_from_unavailable_ollama_to_openai(monkeypatch):
    FakeAsyncClient.next_get_payload = {"models": []}
    FakeAsyncClient.next_post_payload = {
        "output_text": json.dumps(
            {
                "intent": "search_patient",
                "confidence": 0.9,
                "status": "ready",
                "fields": {
                    "patientId": None,
                    "patientQuery": "Carmen",
                    "professionalId": None,
                    "professionalQuery": None,
                    "treatmentType": None,
                    "dateRange": None,
                    "preferredDate": None,
                    "preferredTime": None,
                    "timePreference": None,
                    "durationMinutes": None,
                    "appointmentId": None,
                    "taskText": None,
                    "noteText": None,
                    "amount": None,
                    "selectedSlotIndex": None,
                    "budgetLines": None,
                    "budgetStatus": None,
                },
                "missingFields": [],
                "needsClarification": False,
                "clarificationQuestion": None,
                "requiresConfirmation": False,
                "riskLevel": "low",
                "spokenSummary": "Buscar Carmen.",
            }
        )
    }
    monkeypatch.setattr("app.services.assistant_llm_interpreter.httpx.AsyncClient", FakeAsyncClient)
    request = AssistantInterpretRequest.model_validate(
        {
            "userText": "Busca a Carmen.",
            "context": {
                "screen": "Agenda",
                "currentPatientId": None,
                "hasCurrentPatient": False,
                "currentPatientDisplayName": None,
                "selectedAppointmentId": None,
                "hasSelectedAppointment": False,
                "currentUserRole": "recepcion",
                "permissions": ["read_patients"],
                "visibleDateRange": "2026-07-01",
                "recentActions": [],
            },
        }
    )

    intent = await interpret_assistant_intent(
        request,
        Settings(
            llm_provider="auto",
            llm_fallback_order="ollama,openai,mock",
            openai_api_key="sk-test",
            openai_model="gpt-4o-mini",
        ),
    )

    assert intent.intent == "search_patient"
    assert FakeAsyncClient.last_post_url == "https://api.openai.com/v1/responses"
    assert FakeAsyncClient.last_post_json["model"] == "gpt-4o-mini"
