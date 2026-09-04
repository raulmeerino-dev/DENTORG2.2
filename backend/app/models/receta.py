"""Modelos de recetas privadas/locales y preparacion para proveedor externo."""
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin


class RecetaPlantilla(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Plantilla oficial/colegial importada por clinica para recetas locales."""

    __tablename__ = "receta_plantillas"

    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_guardado: Mapped[str] = mapped_column(String(255), nullable=False)
    ruta: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(nullable=False)
    campos_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    requiere_dni: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    requiere_fecha_nacimiento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    clinica: Mapped["Clinica | None"] = relationship("Clinica")  # noqa: F821


class RecetaClinica(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Receta autonoma con borrador, emision local y proveedor externo."""

    __tablename__ = "recetas_clinicas"

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    plantilla_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("receta_plantillas.id"), nullable=True, index=True
    )

    medicamento: Mapped[str] = mapped_column(Text, nullable=False, default="")
    principio_activo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    forma_farmaceutica: Mapped[str | None] = mapped_column(String(100), nullable=True)
    via_administracion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unidades: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duracion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    posologia: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pauta: Mapped[str | None] = mapped_column(String(200), nullable=True)
    diagnostico: Mapped[str | None] = mapped_column(Text, nullable=True)
    instrucciones_paciente: Mapped[str | None] = mapped_column(Text, nullable=True)
    instrucciones_farmacia: Mapped[str | None] = mapped_column(Text, nullable=True)

    prescriptor_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)
    prescriptor_num_colegiado: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prescriptor_colegio: Mapped[str | None] = mapped_column(String(150), nullable=True)
    prescriptor_provincia: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prescriptor_especialidad: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prescriptor_nif: Mapped[str | None] = mapped_column(String(30), nullable=True)

    fecha_prescripcion: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_dispensacion: Mapped[date | None] = mapped_column(Date, nullable=True)

    estado: Mapped[str] = mapped_column(String(40), nullable=False, default="borrador", index=True)
    provider_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="disabled")
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    provider_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    provider_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pdf_documento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documentos_paciente.id"), nullable=True
    )
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_hash_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    firma_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_generado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    emitida_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enviada_proveedor_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    certificada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rechazada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    anulada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispensada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    emitida_por_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    anulada_por_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    ip_ultima_accion: Mapped[str | None] = mapped_column(String(80), nullable=True)
    user_agent_ultima_accion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
    clinica: Mapped["Clinica | None"] = relationship("Clinica")  # noqa: F821
    plantilla: Mapped["RecetaPlantilla | None"] = relationship("RecetaPlantilla")
    pdf_documento: Mapped["DocumentoPaciente | None"] = relationship("DocumentoPaciente")  # noqa: F821
