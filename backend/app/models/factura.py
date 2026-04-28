import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

TipoFacturaEnum = Enum("paciente", "iguala", "entidad", name="tipo_factura")
EstadoFacturaEnum = Enum("emitida", "cobrada", "parcial", "anulada", name="estado_factura")


class FormaPago(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "formas_pago"

    nombre: Mapped[str] = mapped_column(String(50), nullable=False)
    activo: Mapped[bool] = mapped_column(default=True, nullable=False)


class Factura(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "facturas"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    entidad_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entidades.id"), nullable=True
    )
    serie: Mapped[str] = mapped_column(String(5), nullable=False, default="A")
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(TipoFacturaEnum, nullable=False, default="paciente")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    iva_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    estado: Mapped[str] = mapped_column(EstadoFacturaEnum, nullable=False, default="emitida")
    forma_pago_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("formas_pago.id"), nullable=True
    )
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Verifactu (RD 1007/2023) ──────────────────────────────────────────────
    # Huella SHA-256 encadenada: hash(factura_anterior + datos_esta_factura)
    huella: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Número de registro en la cadena (1, 2, 3 …) para la serie
    num_registro: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Estado del envío a AEAT: null=pendiente, "enviada", "rechazada", "no_aplica"
    estado_verifactu: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Timestamp del envío a AEAT
    enviada_aeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # ¿Esta factura es rectificativa? (para anulaciones)
    es_rectificativa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Referencia a la factura original que rectifica
    factura_rectificada_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=True
    )

    paciente: Mapped["Paciente"] = relationship("Paciente", back_populates="facturas")  # noqa: F821
    entidad: Mapped["Entidad"] = relationship("Entidad")  # noqa: F821
    forma_pago: Mapped["FormaPago"] = relationship("FormaPago")
    lineas: Mapped[list["FacturaLinea"]] = relationship("FacturaLinea", back_populates="factura")
    cobros: Mapped[list["Cobro"]] = relationship("Cobro", back_populates="factura")
    documentos_fiscales: Mapped[list["DocumentoFiscal"]] = relationship(
        "DocumentoFiscal", back_populates="factura"
    )


class FacturaLinea(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "factura_lineas"

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True
    )
    concepto: Mapped[str] = mapped_column(String(200), nullable=False)
    concepto_ficticio: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cantidad: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    iva_porcentaje: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    factura: Mapped["Factura"] = relationship("Factura", back_populates="lineas")
    historial: Mapped["HistorialClinico"] = relationship("HistorialClinico")  # noqa: F821


class Cobro(UUIDMixin, TimestampMixin, Base):
    """Movimientos de caja — pagos recibidos."""
    __tablename__ = "cobros"

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False
    )
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    importe: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    forma_pago_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("formas_pago.id"), nullable=False
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    anulado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    anulado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    factura: Mapped["Factura"] = relationship("Factura", back_populates="cobros")
    forma_pago: Mapped["FormaPago"] = relationship("FormaPago")
    usuario: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[usuario_id])  # noqa: F821
    anulado_por: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[anulado_por_id])  # noqa: F821


class DocumentoFiscal(UUIDMixin, TimestampMixin, Base):
    """Documento fiscal emitido y archivado sin regeneracion posterior."""
    __tablename__ = "documentos_fiscales"

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False, index=True
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="factura_pdf")
    ruta: Mapped[str] = mapped_column(String(500), nullable=False)
    hash_pdf: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    plantilla_version: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )

    factura: Mapped["Factura"] = relationship("Factura", back_populates="documentos_fiscales")
    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    created_by: Mapped["Usuario"] = relationship("Usuario")  # noqa: F821
