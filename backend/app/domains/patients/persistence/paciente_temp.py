from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.persistence.base import TimestampMixin, UUIDMixin
from app.database import Base


class PacienteTemp(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pacientes_temp"

    id_temp: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="pendiente")
