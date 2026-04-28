"""
Modelo Paciente — campos sensibles cifrados con pgcrypto.

DNI/NIE, teléfonos y email se almacenan como BYTEA cifrado.
La clave de cifrado viene de settings.db_encryption_key.
Nunca se almacenan en claro.
"""
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, LargeBinary, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin, SoftDeleteMixin


class Paciente(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "pacientes"

    codigo: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    num_historial: Mapped[int] = mapped_column(
        Integer,
        server_default=text("nextval('pacientes_num_historial_seq')"),
        unique=True,
        nullable=False,
        index=True,
    )
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    apellidos: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Campos cifrados con pgcrypto (BYTEA)
    dni_nie: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    telefono: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    telefono2: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    email: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Datos de contacto (no sensibles)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    codigo_postal: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ciudad: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provincia: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Entidades (aseguradoras)
    entidad_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entidades.id"), nullable=True
    )
    entidad_alt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entidades.id"), nullable=True
    )

    no_correo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    foto_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Datos de salud: estructura libre en JSONB
    # {"alergias": "...", "medicacion": "...", "operaciones": "...", "enfermedades": "...", "observaciones_medicas": "..."}
    datos_salud: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datos_salud_cifrado: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Relaciones
    entidad: Mapped["Entidad"] = relationship("Entidad", foreign_keys=[entidad_id])  # noqa: F821
    entidad_alt: Mapped["Entidad"] = relationship("Entidad", foreign_keys=[entidad_alt_id])  # noqa: F821
    citas: Mapped[list["Cita"]] = relationship("Cita", back_populates="paciente")  # noqa: F821
    referencias: Mapped[list["Referencia"]] = relationship(  # noqa: F821
        "Referencia", secondary="paciente_referencias", back_populates="pacientes"
    )
    historial: Mapped[list["HistorialClinico"]] = relationship("HistorialClinico", back_populates="paciente")  # noqa: F821
    presupuestos: Mapped[list["Presupuesto"]] = relationship("Presupuesto", back_populates="paciente")  # noqa: F821
    facturas: Mapped[list["Factura"]] = relationship("Factura", back_populates="paciente")  # noqa: F821
    consentimientos: Mapped[list["Consentimiento"]] = relationship("Consentimiento", back_populates="paciente")  # noqa: F821
