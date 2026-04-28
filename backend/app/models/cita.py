import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

EstadoCitaEnum = Enum(
    "programada", "confirmada", "en_clinica", "atendida", "falta", "anulada",
    name="estado_cita"
)

TipoFaltaEnum = Enum(
    "falta", "anulacion_paciente", "anulacion_clinica",
    name="tipo_falta"
)


class Cita(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "citas"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False, index=True
    )
    gabinete_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gabinetes.id"), nullable=True
    )
    fecha_hora: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    duracion_min: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=30)
    estado: Mapped[str] = mapped_column(EstadoCitaEnum, nullable=False, default="programada")
    es_urgencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    recordatorio_enviado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recordatorio_canal: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recordatorio_estado: Mapped[str | None] = mapped_column(String(30), nullable=True)
    recordatorio_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelacion: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Relaciones
    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="citas")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="citas")  # noqa: F821
    gabinete: Mapped["Gabinete"] = relationship("Gabinete", back_populates="citas")  # noqa: F821


class CitaTelefonear(UUIDMixin, TimestampMixin, Base):
    """Cola de citas por reubicar (panel Telefonear)."""
    __tablename__ = "citas_telefonear"

    cita_original_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=False
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado_contacto: Mapped[str] = mapped_column(String(30), default="pendiente", nullable=False)
    ultimo_intento_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proximo_intento_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reubicada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nueva_cita_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True
    )

    cita_original: Mapped["Cita"] = relationship("Cita", foreign_keys=[cita_original_id])  # noqa: F821
    nueva_cita: Mapped["Cita"] = relationship("Cita", foreign_keys=[nueva_cita_id])  # noqa: F821
    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821


class HistorialFaltas(UUIDMixin, TimestampMixin, Base):
    """Registro de faltas y anulaciones para mostrar alertas al dar nueva cita."""
    __tablename__ = "historial_faltas"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    cita_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(TipoFaltaEnum, nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    cita: Mapped["Cita"] = relationship("Cita")  # noqa: F821
