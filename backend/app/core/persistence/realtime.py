"""Durable, content-free invalidation events. Domain routing lives in migrations."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Identity, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RealtimeEvent(Base):
    __tablename__ = "realtime_events"
    __table_args__ = (Index("ix_realtime_events_pending", "id", postgresql_where=text("sequence IS NULL")),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sequence: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    event_type: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    clinica_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    paciente_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    doctor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    audience: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
