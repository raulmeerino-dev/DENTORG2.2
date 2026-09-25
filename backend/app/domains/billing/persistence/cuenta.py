"""Patient charges and payment allocation, independent of fiscal documents."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.persistence.base import TimestampMixin, UUIDMixin
from app.database import Base


class CargoPaciente(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cargos_paciente"
    __table_args__ = (CheckConstraint("importe IS NULL OR importe >= 0", name="ck_cargo_importe"),)

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), index=True
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), unique=True
    )
    factura_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), index=True
    )
    factura_legacy_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), unique=True
    )
    factura_linea_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("factura_lineas.id"), unique=True
    )
    cita_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), index=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id")
    )
    tratamiento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id")
    )
    presupuesto_linea_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presupuesto_lineas.id")
    )
    concepto: Mapped[str] = mapped_column(String(250))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    pieza_dental: Mapped[int | None]
    caras: Mapped[str | None] = mapped_column(String(10))
    base: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    iva_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    descuento_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    importe: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    motivo_cero: Mapped[str | None] = mapped_column(String(500))
    estado: Mapped[str] = mapped_column(String(20), default="activo")
    origen: Mapped[str] = mapped_column(String(30), default="tratamiento")


class AplicacionPago(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "aplicaciones_pago"
    __table_args__ = (
        CheckConstraint("importe > 0", name="ck_aplicacion_importe"),
        CheckConstraint("(cobro_id IS NULL) <> (anticipo_id IS NULL)", name="ck_aplicacion_origen"),
        UniqueConstraint("cargo_id", "cobro_id", name="uq_aplicacion_cobro_cargo"),
        UniqueConstraint("cargo_id", "anticipo_id", name="uq_aplicacion_anticipo_cargo"),
    )
    cargo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargos_paciente.id"), index=True
    )
    cobro_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cobros.id"), index=True
    )
    anticipo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pagos_anticipados_paciente.id"), index=True
    )
    importe: Mapped[Decimal] = mapped_column(Numeric(12, 2))


class OperacionCheckout(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "operaciones_checkout"
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id")
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    resultado: Mapped[dict] = mapped_column(JSONB)
    motivo: Mapped[str | None] = mapped_column(Text)
