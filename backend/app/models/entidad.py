from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class Entidad(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Entidades sanitarias / aseguradoras."""
    __tablename__ = "entidades"

    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    cif: Mapped[str | None] = mapped_column(String(15), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relaciones
    baremos: Mapped[list["EntidadBaremo"]] = relationship("EntidadBaremo", back_populates="entidad")  # noqa: F821
