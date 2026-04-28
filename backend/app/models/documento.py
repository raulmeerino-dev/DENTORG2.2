"""
Modelo DocumentoPaciente — archivos adjuntos vinculados a un paciente.
Puede ser una radiografía, implante, consentimiento, medicación escaneada, etc.
Los ficheros se guardan en disco bajo uploads/pacientes/{paciente_id}/.
"""
import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

CATEGORIAS_DOCUMENTO = (
    "historia_medica",
    "radiografia",
    "cbct",
    "escaner",
    "fotografia_intraoral",
    "fotografia_extraoral",
    "informe",
    "circular",
    "implante",
    "consentimiento",
    "presupuesto",
    "factura",
    "otro",
)


class DocumentoPaciente(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "documentos_paciente"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_guardado: Mapped[str] = mapped_column(String(255), nullable=False)  # UUID + ext
    ruta: Mapped[str] = mapped_column(String(500), nullable=False)             # ruta relativa en disco
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(nullable=False)
    categoria: Mapped[str] = mapped_column(String(50), default="otro", nullable=False, index=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_documento: Mapped[date | None] = mapped_column(Date, nullable=True)
    tratamiento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=True
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True
    )
    etiquetas: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relaciones
    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo | None"] = relationship("TratamientoCatalogo")  # noqa: F821
    historial: Mapped["HistorialClinico | None"] = relationship("HistorialClinico")  # noqa: F821
    doctor: Mapped["Doctor | None"] = relationship("Doctor")  # noqa: F821
