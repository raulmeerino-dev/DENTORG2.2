import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin


class BackupRegistro(UUIDMixin, Base):
    __tablename__ = "backup_registros"

    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="pendiente")
    ruta: Mapped[str | None] = mapped_column(Text, nullable=True)
    ubicacion: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hash_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    tamano_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cifrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
