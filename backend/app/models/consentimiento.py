import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Consentimiento(UUIDMixin, TimestampMixin, Base):
    """Consentimientos informados firmados por el paciente."""
    __tablename__ = "consentimientos"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    tratamiento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )
    documento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documentos_paciente.id"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(100), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), default="pendiente_firma", nullable=False, index=True)
    fecha_firma: Mapped[date] = mapped_column(Date, nullable=False)
    firmado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    documento_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    plantilla_version: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contenido: Mapped[str | None] = mapped_column(Text, nullable=True)
    revocado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_revocacion: Mapped[date | None] = mapped_column(Date, nullable=True)

    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="consentimientos")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo | None"] = relationship("TratamientoCatalogo")  # noqa: F821
    doctor: Mapped["Doctor | None"] = relationship("Doctor")  # noqa: F821
    historial: Mapped["HistorialClinico | None"] = relationship("HistorialClinico")  # noqa: F821
    documento: Mapped["DocumentoPaciente | None"] = relationship("DocumentoPaciente")  # noqa: F821
