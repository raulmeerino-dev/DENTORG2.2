"""
Tabla audit_log — INSERT ONLY. NUNCA UPDATE NI DELETE.
Retención mínima: 5 años (RGPD Art. 9).
"""
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    """
    Registro inmutable de todos los accesos a datos de pacientes.
    PK es BIGSERIAL (no UUID) para máximo rendimiento en INSERT masivo.
    """
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True
    )
    accion: Mapped[str] = mapped_column(String(10), nullable=False)  # CREATE/READ/UPDATE/DELETE
    tabla: Mapped[str] = mapped_column(String(50), nullable=False)
    registro_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    datos_antes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datos_despues: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv4 o IPv6
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
