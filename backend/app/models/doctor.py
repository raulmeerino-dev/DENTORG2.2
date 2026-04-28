from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class Doctor(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "doctores"

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    especialidad: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color_agenda: Mapped[str | None] = mapped_column(String(7), nullable=True)  # Hex color
    es_auxiliar: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    porcentaje: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )  # % comisiones

    # Relaciones
    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="doctor", uselist=False)  # noqa: F821
    citas: Mapped[list["Cita"]] = relationship("Cita", back_populates="doctor")  # noqa: F821
    horarios: Mapped[list["HorarioDoctor"]] = relationship("HorarioDoctor", back_populates="doctor")  # noqa: F821
