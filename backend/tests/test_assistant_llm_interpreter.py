from app.config import Settings
from app.schemas.assistant import AssistantInterpretRequest, DraftPatchInterpretRequest
from app.services.assistant_llm_interpreter import (
    ALLOWED_INTENTS,
    ASSISTANT_INTENT_JSON_SCHEMA,
    SYSTEM_PROMPT,
    LLMIntentInterpreter,
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
    assert "visibleOptions" in user_payload
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
