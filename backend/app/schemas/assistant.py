from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AssistantIntentName = Literal[
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

AssistantPhase = Literal[
    "ready",
    "draft",
    "needs_clarification",
    "awaiting_confirmation",
    "cancelled",
    "error",
]

AssistantRiskLevel = Literal["low", "medium", "high"]
AssistantTimePreference = Literal["morning", "afternoon", "first_available", "last_available"]
AssistantBudgetStatus = Literal["draft", "pending", "accepted", "rejected", "cancelled"]
DraftPatchAction = Literal[
    "update_fields",
    "clear_fields",
    "select_option",
    "confirm",
    "cancel",
    "start_new",
    "ask_clarification",
    "unknown",
]


class AssistantBudgetLine(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    treatment_query: str | None = Field(default=None, alias="treatmentQuery")
    treatment_id: str | None = Field(default=None, alias="treatmentId")
    description: str | None = None
    tooth: str | None = None
    quantity: int | None = None
    unit_price: float | None = Field(default=None, alias="unitPrice")
    discount: float | None = None
    total: float | None = None


class AssistantIntentFields(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    patient_id: str | None = Field(default=None, alias="patientId")
    patient_query: str | None = Field(default=None, alias="patientQuery")
    professional_id: str | None = Field(default=None, alias="professionalId")
    professional_query: str | None = Field(default=None, alias="professionalQuery")
    treatment_type: str | None = Field(default=None, alias="treatmentType")
    date_range: str | None = Field(default=None, alias="dateRange")
    preferred_date: str | None = Field(default=None, alias="preferredDate")
    preferred_time: str | None = Field(default=None, alias="preferredTime")
    time_preference: AssistantTimePreference | None = Field(default=None, alias="timePreference")
    duration_minutes: int | None = Field(default=None, alias="durationMinutes")
    appointment_id: str | None = Field(default=None, alias="appointmentId")
    task_text: str | None = Field(default=None, alias="taskText")
    note_text: str | None = Field(default=None, alias="noteText")
    amount: float | None = None
    selected_slot_index: int | None = Field(default=None, alias="selectedSlotIndex")
    budget_lines: list[AssistantBudgetLine] | None = Field(default=None, alias="budgetLines")
    budget_status: AssistantBudgetStatus | None = Field(default=None, alias="budgetStatus")


class AssistantIntentPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    intent: AssistantIntentName
    confidence: float = Field(ge=0, le=1)
    status: AssistantPhase
    fields: AssistantIntentFields = Field(default_factory=AssistantIntentFields)
    missing_fields: list[str] = Field(default_factory=list, alias="missingFields")
    needs_clarification: bool = Field(alias="needsClarification")
    clarification_question: str | None = Field(default=None, alias="clarificationQuestion")
    requires_confirmation: bool = Field(alias="requiresConfirmation")
    risk_level: AssistantRiskLevel = Field(alias="riskLevel")
    spoken_summary: str = Field(alias="spokenSummary")


class SafeAssistantContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    screen: str
    current_patient_id: str | None = Field(default=None, alias="currentPatientId")
    has_current_patient: bool = Field(alias="hasCurrentPatient")
    current_patient_display_name: str | None = Field(default=None, alias="currentPatientDisplayName")
    selected_appointment_id: str | None = Field(default=None, alias="selectedAppointmentId")
    has_selected_appointment: bool = Field(alias="hasSelectedAppointment")
    current_user_role: str | None = Field(default=None, alias="currentUserRole")
    permissions: list[str] = Field(default_factory=list)
    visible_date_range: str | None = Field(default=None, alias="visibleDateRange")
    recent_actions: list[str] = Field(default_factory=list, alias="recentActions")


class AssistantInterpretRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    user_text: str = Field(min_length=1, max_length=1000, alias="userText")
    context: SafeAssistantContext
    current_draft: AssistantIntentPayload | None = Field(default=None, alias="currentDraft")
    last_assistant_question: str | None = Field(default=None, alias="lastAssistantQuestion")


class AssistantInterpretResponse(BaseModel):
    intent: AssistantIntentPayload


class DraftPatchUpdates(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    patient_query: str | None = Field(default=None, alias="patientQuery")
    patient_id: str | None = Field(default=None, alias="patientId")
    professional_query: str | None = Field(default=None, alias="professionalQuery")
    professional_id: str | None = Field(default=None, alias="professionalId")
    treatment_type: str | None = Field(default=None, alias="treatmentType")
    date_range: str | None = Field(default=None, alias="dateRange")
    preferred_date: str | None = Field(default=None, alias="preferredDate")
    preferred_time: str | None = Field(default=None, alias="preferredTime")
    time_preference: AssistantTimePreference | None = Field(default=None, alias="timePreference")
    duration_minutes: int | None = Field(default=None, alias="durationMinutes")
    selected_slot_index: int | None = Field(default=None, alias="selectedSlotIndex")
    task_text: str | None = Field(default=None, alias="taskText")
    note_text: str | None = Field(default=None, alias="noteText")
    amount: float | None = None
    budget_lines: list[AssistantBudgetLine] | None = Field(default=None, alias="budgetLines")
    budget_status: AssistantBudgetStatus | None = Field(default=None, alias="budgetStatus")


class VisiblePatientOption(BaseModel):
    id: str
    display_name: str = Field(alias="displayName")


class VisibleProfessionalOption(BaseModel):
    id: str
    display_name: str = Field(alias="displayName")


class VisibleSlotOption(BaseModel):
    id: str
    start: str
    end: str | None = None
    professional_id: str | None = Field(default=None, alias="professionalId")


class DraftPatchVisibleOptions(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    patients: list[VisiblePatientOption] = Field(default_factory=list)
    professionals: list[VisibleProfessionalOption] = Field(default_factory=list)
    slots: list[VisibleSlotOption] = Field(default_factory=list)


class DraftPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    action: DraftPatchAction
    confidence: float = Field(ge=0, le=1)
    updates: DraftPatchUpdates | None = None
    clear_fields: list[str] = Field(default_factory=list, alias="clearFields")
    clarification_question: str | None = Field(default=None, alias="clarificationQuestion")
    spoken_summary: str = Field(alias="spokenSummary")


class DraftPatchInterpretRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    user_text: str = Field(min_length=1, max_length=1000, alias="userText")
    current_draft: AssistantIntentPayload = Field(alias="currentDraft")
    safe_context: SafeAssistantContext = Field(alias="safeContext")
    last_assistant_question: str | None = Field(default=None, alias="lastAssistantQuestion")
    visible_options: DraftPatchVisibleOptions = Field(default_factory=DraftPatchVisibleOptions, alias="visibleOptions")


class DraftPatchInterpretResponse(BaseModel):
    patch: DraftPatch
