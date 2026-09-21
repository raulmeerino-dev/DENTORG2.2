from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.persistence.base import TimestampMixin, UUIDMixin
from app.database import Base


class Clinica(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "clinicas"

    nombre: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cif: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
