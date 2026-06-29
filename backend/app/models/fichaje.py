import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

TipoFichajeEnum = Enum("entrada", "salida", name="tipo_fichaje")
OrigenTrabajadorFichajeEnum = Enum("trabajador", "usuario", name="origen_trabajador_fichaje")


class Trabajador(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "trabajadores"

    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    codigo: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    rol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True, index=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True, index=True
    )


class FichajeTrabajador(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "fichajes_trabajadores"

    trabajador_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    trabajador_origen: Mapped[str] = mapped_column(OrigenTrabajadorFichajeEnum, nullable=False)
    trabajador_nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora_exacta: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(TipoFichajeEnum, nullable=False)
    equipo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    registrado_por_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True, index=True
    )
