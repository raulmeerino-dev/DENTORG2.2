"""Historical PDF attachment to an invoice; the recetas SQL table is preserved."""
import uuid

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.persistence.base import TimestampMixin, UUIDMixin
from app.database import Base


class RecetaFactura(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recetas"

    factura_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False, unique=True, index=True
    )
    contenido_base64: Mapped[str] = mapped_column(Text, nullable=False)

    factura: Mapped["Factura"] = relationship("Factura")  # noqa: F821
