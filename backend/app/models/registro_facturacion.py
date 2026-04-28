import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class RegistroFacturacion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "registros_facturacion"
    __table_args__ = (
        UniqueConstraint("serie", "secuencia", name="uq_registro_facturacion_serie_secuencia"),
        UniqueConstraint("factura_id", "tipo_registro", name="uq_registro_facturacion_factura_tipo"),
    )

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False, index=True
    )
    serie: Mapped[str] = mapped_column(String(5), nullable=False, index=True)
    numero_factura: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo_registro: Mapped[str] = mapped_column(String(30), nullable=False)
    secuencia: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    huella_anterior: Mapped[str | None] = mapped_column(String(64), nullable=True)
    huella: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    estado_remision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    enviado_aeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    factura: Mapped["Factura"] = relationship("Factura")  # noqa: F821
