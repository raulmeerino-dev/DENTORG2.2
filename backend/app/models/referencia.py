import uuid

from sqlalchemy import Column, ForeignKey, PrimaryKeyConstraint, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

# Tabla M2M paciente ↔ referencia
paciente_referencias = Table(
    "paciente_referencias",
    Base.metadata,
    Column("paciente_id", UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False),
    Column("referencia_id", UUID(as_uuid=True), ForeignKey("referencias.id"), nullable=False),
    PrimaryKeyConstraint("paciente_id", "referencia_id"),
)


class Referencia(UUIDMixin, TimestampMixin, Base):
    """Tags para filtrar pacientes: VIP, Ortodoncia, Impagado..."""
    __tablename__ = "referencias"

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # Hex

    pacientes: Mapped[list["Paciente"]] = relationship(  # noqa: F821
        "Paciente", secondary=paciente_referencias, back_populates="referencias"
    )
