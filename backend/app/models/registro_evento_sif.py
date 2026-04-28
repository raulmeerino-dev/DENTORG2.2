"""
Registro de eventos del sistema informatico de facturacion.

Sirve como base de trazabilidad para las operaciones fiscalmente relevantes
del SIF y para los controles internos de cumplimiento.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin


class RegistroEventoSIF(UUIDMixin, Base):
    __tablename__ = "registro_eventos_sif"

    tipo_evento: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    factura_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=True, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True, index=True
    )
    sistema_codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    sistema_version: Mapped[str] = mapped_column(String(20), nullable=False)
    detalles: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
