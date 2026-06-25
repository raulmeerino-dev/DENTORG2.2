import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DictadoClinico(UUIDMixin, TimestampMixin, Base):
    """Metadatos trazables de un dictado clinico sin conservar audio por defecto."""

    __tablename__ = "dictados_clinicos"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True, index=True
    )
    nota_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notas_dentales.id"), nullable=True, index=True
    )
    contexto: Mapped[str | None] = mapped_column(String(40), nullable=True)
    proveedor: Mapped[str | None] = mapped_column(String(80), nullable=True)
    transcripcion_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcripcion_editada: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="recibido", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_conservado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    audio_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    doctor: Mapped["Doctor | None"] = relationship("Doctor")  # noqa: F821
    usuario: Mapped["Usuario | None"] = relationship("Usuario")  # noqa: F821
    nota: Mapped["NotaDental | None"] = relationship("NotaDental")  # noqa: F821
