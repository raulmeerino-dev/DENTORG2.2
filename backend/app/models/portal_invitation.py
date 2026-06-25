import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class PortalInvitation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "portal_invitations"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    proposito: Mapped[str] = mapped_column(String(50), nullable=False, default="portal_access")
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="activa", index=True)
    uso_unico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    last_access_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    created_by: Mapped["Usuario | None"] = relationship("Usuario", foreign_keys=[created_by_id])  # noqa: F821
    revoked_by: Mapped["Usuario | None"] = relationship("Usuario", foreign_keys=[revoked_by_id])  # noqa: F821
