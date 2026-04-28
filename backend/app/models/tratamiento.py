import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class FamiliaTratamiento(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Agrupaciones de tratamientos: Obturaciones, Endodoncias, Cirugía..."""
    __tablename__ = "familias_tratamiento"

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    icono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    tratamientos: Mapped[list["TratamientoCatalogo"]] = relationship(
        "TratamientoCatalogo", back_populates="familia"
    )


class TratamientoCatalogo(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Catálogo de tratamientos con precio base."""
    __tablename__ = "tratamientos_catalogo"

    familia_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("familias_tratamiento.id"), nullable=False
    )
    codigo: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    iva_porcentaje: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=0)
    requiere_pieza: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requiere_caras: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    familia: Mapped["FamiliaTratamiento"] = relationship("FamiliaTratamiento", back_populates="tratamientos")


class EntidadBaremo(UUIDMixin, TimestampMixin, Base):
    """Precios que cubre cada entidad/aseguradora por tratamiento."""
    __tablename__ = "entidades_baremo"

    entidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entidades.id"), nullable=False
    )
    tratamiento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=False
    )
    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    entidad: Mapped["Entidad"] = relationship("Entidad", back_populates="baremos")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo"] = relationship("TratamientoCatalogo")
