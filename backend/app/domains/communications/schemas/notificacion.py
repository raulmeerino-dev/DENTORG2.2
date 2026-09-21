from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DoctorNotificationResponse(BaseModel):
    id: UUID
    recipient_doctor_id: UUID
    appointment_id: UUID
    patient_id: UUID
    clinica_id: UUID | None = None
    title: str
    message: str
    type: str
    read: bool
    read_at: datetime | None = None
    created_at: datetime
    patient_name: str
    appointment_time: datetime

    model_config = {"from_attributes": True}
