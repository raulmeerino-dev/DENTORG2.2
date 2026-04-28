"""
Modelos de laboratorio dental.
- Laboratorio: catálogo de laboratorios externos (prótesis, ortodoncia, etc.)
- TrabajoLaboratorio: encargo enviado a un laboratorio, vinculado a paciente + historial.
"""
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


ESTADOS_TRABAJO_LAB = (
    "pendiente",       # registrado, aún no enviado
    "enviado",         # salido hacia el lab
    "en_proceso",      # el lab confirma que lo está haciendo
    "recibido",        # llegó de vuelta a la clínica
    "entregado",       # entregado al paciente
    "incidencia",      # problema (retrabajo, error, etc.)
)


class Laboratorio(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Catálogo de laboratorios externos."""
    __tablename__ = "laboratorios"

    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(30), nullable=True)   # número normalizado para wa.me
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(150), nullable=True)   # nombre del contacto
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    trabajos: Mapped[list["TrabajoLaboratorio"]] = relationship(
        "TrabajoLaboratorio", back_populates="laboratorio"
    )


class TrabajoLaboratorio(UUIDMixin, TimestampMixin, Base):
    """Encargo enviado a un laboratorio dental."""
    __tablename__ = "trabajos_laboratorio"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )
    laboratorio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("laboratorios.id"), nullable=False, index=True
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )
    tratamiento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=True
    )
    presupuesto_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presupuestos.id"), nullable=True
    )
    factura_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=True
    )

    referencia: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    tipo_trabajo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    pieza_dental: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)      # color dental (A2, B1, ...)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    fecha_salida: Mapped[date | None] = mapped_column(Date, nullable=True)    # cuándo sale a lab
    fecha_entrega_prevista: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_recepcion: Mapped[date | None] = mapped_column(Date, nullable=True)  # cuándo vuelve
    fecha_entrega_paciente: Mapped[date | None] = mapped_column(Date, nullable=True)

    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente", index=True
    )
    precio: Mapped[float | None] = mapped_column(nullable=True)               # lo que cobra el lab
    coste_laboratorio: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    precio_paciente: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    margen: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    comision_doctor_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    estado_pago_laboratorio: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente")
    estado_cobro_paciente: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente")

    # Relaciones
    paciente: Mapped["Paciente"] = relationship("Paciente")   # noqa: F821
    doctor: Mapped["Doctor"] = relationship("Doctor")          # noqa: F821
    laboratorio: Mapped["Laboratorio"] = relationship("Laboratorio", back_populates="trabajos")
    historial: Mapped["HistorialClinico | None"] = relationship("HistorialClinico")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo | None"] = relationship("TratamientoCatalogo")  # noqa: F821
    presupuesto: Mapped["Presupuesto | None"] = relationship("Presupuesto")  # noqa: F821
    factura: Mapped["Factura | None"] = relationship("Factura")  # noqa: F821
