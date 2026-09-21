from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WhatsAppWebhookPayload(BaseModel):
    """Payload tolerante para webhooks de proveedores WhatsApp comunes."""

    model_config = ConfigDict(extra="allow")

    from_phone: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=80)
    wa_id: str | None = Field(None, max_length=80)
    From: str | None = Field(None, max_length=80)
    message_body: str | None = Field(None, max_length=2000)
    body: str | None = Field(None, max_length=2000)
    Body: str | None = Field(None, max_length=2000)
    text: str | dict[str, Any] | None = None
    message_id: str | None = Field(None, max_length=120)
    MessageSid: str | None = Field(None, max_length=120)
    provider_message_id: str | None = Field(None, max_length=120)
    received_at: datetime | None = None


class WhatsAppCommunicationResponse(BaseModel):
    id: UUID
    clinica_id: UUID | None
    patient_id: UUID | None
    appointment_id: UUID | None
    direction: str
    phone: str | None
    message_body: str
    received_at: datetime | None
    sent_at: datetime | None
    interpreted_intent: str | None
    processed: bool
    provider_message_id: str | None
    idempotency_key: str | None = None
    raw_payload: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WhatsAppPatientSummary(BaseModel):
    id: UUID
    nombre: str
    apellidos: str
    num_historial: int | None = None


class WhatsAppAppointmentSummary(BaseModel):
    id: UUID
    fecha_hora: datetime
    estado: str
    motivo: str | None = None
    doctor_nombre: str | None = None
    doctor_id: UUID | None = None
    gabinete_id: UUID | None = None
    duracion_min: int


class WhatsAppInboxItem(WhatsAppCommunicationResponse):
    patient: WhatsAppPatientSummary | None = None
    appointment: WhatsAppAppointmentSummary | None = None


class WhatsAppActionRequest(BaseModel):
    action: str = Field(..., pattern=r"^(confirm|cancel|mark_pending|manual_review|mark_reviewed|ignore)$")
    note: str | None = Field(None, max_length=500)


class WhatsAppRescheduleRequest(BaseModel):
    fecha_hora: datetime
    duracion_min: int | None = Field(None, ge=10, le=480)
    gabinete_id: UUID | None = None
    forzar_fuera_horario: bool = False
    note: str | None = Field(None, max_length=500)


class WhatsAppWebhookResponse(BaseModel):
    status: str
    communication_id: UUID | None = None
    patient_id: UUID | None = None
    appointment_id: UUID | None = None
    interpreted_intent: str | None = None
    applied_status: str | None = None
    processed: bool = False
    duplicate: bool = False
    detail: str | None = None
