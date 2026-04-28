import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class HistorialClinico(UUIDMixin, TimestampMixin, Base):
    """Registro de tratamientos realizados sobre piezas dentales."""
    __tablename__ = "historial_clinico"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    tratamiento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=False
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )
    gabinete_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gabinetes.id"), nullable=True
    )
    pieza_dental: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True
    )  # FDI 11-48
    caras: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "MOD", "VL"
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    diagnostico: Mapped[str | None] = mapped_column(Text, nullable=True)
    procedimiento: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="realizado", index=True)
    importe: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    factura_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=True, index=True
    )

    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="historial")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo"] = relationship("TratamientoCatalogo")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
    gabinete: Mapped["Gabinete"] = relationship("Gabinete")  # noqa: F821
    factura: Mapped["Factura | None"] = relationship("Factura")  # noqa: F821
