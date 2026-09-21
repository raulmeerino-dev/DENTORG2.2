from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.persistence.base import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.database import Base


class Gabinete(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "gabinetes"

    nombre: Mapped[str] = mapped_column(String(50), nullable=False)

    # Relaciones
    citas: Mapped[list["Cita"]] = relationship("Cita", back_populates="gabinete")  # noqa: F821
