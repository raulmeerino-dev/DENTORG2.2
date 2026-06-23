import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DoctorNotification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "doctor_notifications"
    __table_args__ = (
        UniqueConstraint(
            "recipient_doctor_id",
            "appointment_id",
            "type",
            name="uq_doctor_notifications_recipient_appointment_type",
        ),
    )

    recipient_doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False, index=True
    )
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    recipient_doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
    appointment: Mapped["Cita"] = relationship("Cita")  # noqa: F821
    patient: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
