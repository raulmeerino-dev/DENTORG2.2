import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

TipoDiaEnum = Enum("laborable", "semilaborable", "festivo", name="tipo_dia")


class HorarioDoctor(UUIDMixin, TimestampMixin, Base):
    """Horario semanal base de cada doctor."""
    __tablename__ = "horarios_doctor"
    __table_args__ = (UniqueConstraint("doctor_id", "dia_semana", name="uq_doctor_dia"),)

    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )
    dia_semana: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Lunes..6=Domingo
    tipo_dia: Mapped[str] = mapped_column(TipoDiaEnum, nullable=False, default="laborable")
    # [{"inicio": "09:00", "fin": "14:00"}, {"inicio": "17:00", "fin": "21:00"}]
    bloques: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    intervalo_min: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=10)

    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="horarios")  # noqa: F821


class HorarioExcepcion(UUIDMixin, TimestampMixin, Base):
    """Excepciones al horario base (días festivos, vacaciones, etc.)."""
    __tablename__ = "horarios_excepciones"

    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=False
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    tipo_dia: Mapped[str] = mapped_column(TipoDiaEnum, nullable=False)
    bloques: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    no_trabaja: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    doctor: Mapped["Doctor"] = relationship("Doctor")  # noqa: F821
