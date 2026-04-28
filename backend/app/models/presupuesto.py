import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

EstadoPresupuestoEnum = Enum(
    "borrador", "presentado", "aceptado", "rechazado", "parcial",
    name="estado_presupuesto"
)


class Presupuesto(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "presupuestos"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    numero: Mapped[int] = mapped_column(
        Numeric,
        server_default=text("nextval('presupuestos_numero_seq')"),
        nullable=False,
        unique=True,
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[str] = mapped_column(EstadoPresupuestoEnum, nullable=False, default="borrador")
    pie_pagina: Mapped[str | None] = mapped_column(Text, nullable=True)
    odontograma: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )

    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="presupuestos")  # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
    lineas: Mapped[list["PresupuestoLinea"]] = relationship("PresupuestoLinea", back_populates="presupuesto")


class PresupuestoLinea(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "presupuesto_lineas"

    presupuesto_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presupuestos.id"), nullable=False
    )
    tratamiento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=False
    )
    pieza_dental: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    caras: Mapped[str | None] = mapped_column(String(10), nullable=True)
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    descuento_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    aceptado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pasado_trabajo_pendiente: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    presupuesto: Mapped["Presupuesto"] = relationship("Presupuesto", back_populates="lineas")
    tratamiento: Mapped["TratamientoCatalogo"] = relationship("TratamientoCatalogo")  # noqa: F821


class TrabajoPendiente(UUIDMixin, TimestampMixin, Base):
    """Tratamientos aceptados en presupuesto pendientes de realizar."""
    __tablename__ = "trabajo_pendiente"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    presupuesto_linea_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presupuesto_lineas.id"), nullable=False
    )
    tratamiento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=False
    )
    pieza_dental: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    caras: Mapped[str | None] = mapped_column(String(10), nullable=True)
    realizado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    presupuesto_linea: Mapped["PresupuestoLinea"] = relationship("PresupuestoLinea")
    tratamiento: Mapped["TratamientoCatalogo"] = relationship("TratamientoCatalogo")  # noqa: F821
    historial: Mapped["HistorialClinico"] = relationship("HistorialClinico")  # noqa: F821
