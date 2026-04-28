import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
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

    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Producto(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "productos"

    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    stock_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_act: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    proveedor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proveedores.id"), nullable=True
    )
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    proveedor: Mapped["Proveedor"] = relationship("Proveedor")  # noqa: F821


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
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )

    producto: Mapped["Producto"] = relationship("Producto")  # noqa: F821
    factura: Mapped["Factura"] = relationship("Factura")  # noqa: F821
    usuario: Mapped["Usuario"] = relationship("Usuario")  # noqa: F821


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
