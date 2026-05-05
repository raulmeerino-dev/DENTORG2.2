import uuid

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Odontograma(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "odontogramas"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    piezas: Mapped[list["OdontogramaPieza"]] = relationship(
        "OdontogramaPieza",
        back_populates="odontograma",
        cascade="all, delete-orphan",
        order_by="OdontogramaPieza.pieza_fdi",
    )


class OdontogramaPieza(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "odontograma_piezas"
    __table_args__ = (
        UniqueConstraint("odontograma_id", "pieza_fdi", name="uq_odontograma_pieza"),
    )

    odontograma_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("odontogramas.id"), nullable=False, index=True
    )
    pieza_fdi: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)
    estado_general: Mapped[str] = mapped_column(String(40), nullable=False, default="sano", index=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    odontograma: Mapped["Odontograma"] = relationship("Odontograma", back_populates="piezas")
    superficies: Mapped[list["OdontogramaSuperficie"]] = relationship(
        "OdontogramaSuperficie",
        back_populates="pieza",
        cascade="all, delete-orphan",
        order_by="OdontogramaSuperficie.superficie",
    )


class OdontogramaSuperficie(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "odontograma_superficies"
    __table_args__ = (
        UniqueConstraint("pieza_id", "superficie", name="uq_odontograma_superficie"),
    )

    pieza_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("odontograma_piezas.id"), nullable=False, index=True
    )
    superficie: Mapped[str] = mapped_column(String(30), nullable=False)
    condicion: Mapped[str] = mapped_column(String(40), nullable=False, default="sano", index=True)
    tratamiento_planificado_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=True
    )
    tratamiento_realizado_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )
    color_estado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    pieza: Mapped["OdontogramaPieza"] = relationship("OdontogramaPieza", back_populates="superficies")
    tratamiento_planificado: Mapped["TratamientoCatalogo"] = relationship("TratamientoCatalogo")  # noqa: F821
    tratamiento_realizado: Mapped["HistorialClinico"] = relationship("HistorialClinico")  # noqa: F821


class OdontogramaEvento(UUIDMixin, Base):
    __tablename__ = "odontograma_eventos"

    odontograma_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("odontogramas.id"), nullable=False, index=True
    )
    pieza_fdi: Mapped[int | None] = mapped_column(SmallInteger, nullable=True, index=True)
    superficie: Mapped[str | None] = mapped_column(String(30), nullable=True)
    accion: Mapped[str] = mapped_column(String(80), nullable=False)
    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
