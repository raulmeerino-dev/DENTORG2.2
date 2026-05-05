import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Clinica(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "clinicas"

    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cif: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Teleconsulta(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "teleconsultas"

    cita_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=False, unique=True, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="iniciada")

    cita: Mapped["Cita"] = relationship("Cita")  # noqa: F821


class Proveedor(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "proveedores"

    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    contacto: Mapped[str | None] = mapped_column(String(150), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    clinica: Mapped["Clinica"] = relationship("Clinica")  # noqa: F821
    productos: Mapped[list["Producto"]] = relationship("Producto", back_populates="proveedor")  # noqa: F821


class Producto(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "productos"

    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    categoria: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    stock_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_act: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unidad: Mapped[str] = mapped_column(String(30), nullable=False, default="ud")
    coste_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    proveedor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proveedores.id"), nullable=True
    )
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    clinica: Mapped["Clinica"] = relationship("Clinica")  # noqa: F821
    proveedor: Mapped["Proveedor"] = relationship("Proveedor", back_populates="productos")  # noqa: F821
    movimientos: Mapped[list["MovimientoInventario"]] = relationship("MovimientoInventario", back_populates="producto")  # noqa: F821


class MovimientoInventario(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "movimientos_inventario"

    producto_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("productos.id"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_resultante: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    factura_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=True, index=True
    )
    referencia_tipo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    referencia_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )

    producto: Mapped["Producto"] = relationship("Producto", back_populates="movimientos")  # noqa: F821
    factura: Mapped["Factura"] = relationship("Factura")  # noqa: F821
    usuario: Mapped["Usuario"] = relationship("Usuario")  # noqa: F821


class PedidoProveedor(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pedidos_proveedor"

    proveedor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proveedores.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="borrador", index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    clinica: Mapped["Clinica"] = relationship("Clinica")  # noqa: F821
    proveedor: Mapped["Proveedor"] = relationship("Proveedor")  # noqa: F821
    lineas: Mapped[list["PedidoLinea"]] = relationship(
        "PedidoLinea",
        back_populates="pedido",
        cascade="all, delete-orphan",
    )  # noqa: F821


class PedidoLinea(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pedido_lineas"

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos_proveedor.id"), nullable=False, index=True
    )
    producto_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("productos.id"), nullable=False, index=True
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    coste_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    pedido: Mapped["PedidoProveedor"] = relationship("PedidoProveedor", back_populates="lineas")  # noqa: F821
    producto: Mapped["Producto"] = relationship("Producto")  # noqa: F821


class Receta(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recetas"

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False, unique=True, index=True
    )
    contenido_base64: Mapped[str] = mapped_column(Text, nullable=False)

    factura: Mapped["Factura"] = relationship("Factura")  # noqa: F821


class PacienteTemp(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pacientes_temp"

    id_temp: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="pendiente")
