import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin

RolEnum = Enum("recepcion", "doctor", "admin", name="rol_usuario")


class Usuario(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "usuarios"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    rol: Mapped[str] = mapped_column(RolEnum, nullable=False)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True
    )
    ultimo_acceso: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relaciones
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="usuario", foreign_keys=[doctor_id])  # noqa: F821
