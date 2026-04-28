"""Mixins y tipos base compartidos por todos los modelos."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UUIDMixin:
    """Primary key UUID generado por PostgreSQL."""
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )


class TimestampMixin:
    """Campos de auditoría de tiempo en todas las tablas."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True,
    )


class SoftDeleteMixin:
    """Soft delete — nunca se borran datos clínicos."""
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
