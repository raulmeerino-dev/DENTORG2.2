"""
Modelo de receta clínica.

Distinto del modelo `Receta` legacy (cache de PDF emitido desde factura).
`RecetaClinica` es una receta independiente con campos clínicos estructurados,
emitida directamente por un doctor sobre un paciente.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin


class RecetaClinica(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Receta clinica autónoma emitida por un doctor para un paciente."""
    __tablename__ = "recetas_clinicas"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )

    # Datos clinicos
    medicamento: Mapped[str] = mapped_column(Text, nullable=False)
    principio_activo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    forma_farmaceutica: Mapped[str | None] = mapped_column(String(100), nullable=True)
    via_administracion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unidades: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duracion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    posologia: Mapped[str] = mapped_column(Text, nullable=False)
    pauta: Mapped[str | None] = mapped_column(String(200), nullable=True)
    diagnostico: Mapped[str | None] = mapped_column(Text, nullable=True)
    instrucciones_paciente: Mapped[str | None] = mapped_column(Text, nullable=True)
    instrucciones_farmacia: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Fechas
    fecha_prescripcion: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_dispensacion: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Firma y PDF
    firma_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_generado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relaciones
    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
    clinica: Mapped["Clinica | None"] = relationship("Clinica")  # noqa: F821
