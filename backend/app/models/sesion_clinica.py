import uuid

from sqlalchemy import Enum, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

EstadoSesionItemEnum = Enum(
    "planificado",
    "en_curso",
    "pospuesto",
    "realizado",
    name="estado_sesion_item",
)

OrigenSesionItemEnum = Enum(
    "manual",
    "cita",
    "presupuesto_linea",
    name="origen_sesion_item",
)


class SesionClinicaItem(UUIDMixin, TimestampMixin, Base):
    """Tratamiento del plan de sesión clínica en curso para un paciente.

    La "sesión activa" del paciente es el conjunto de items con
    estado != "realizado". Al finalizar como realizado, el item queda
    marcado con historial_id y estado="realizado" para trazabilidad.
    """
    __tablename__ = "sesion_clinica_items"

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    clinica_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinicas.id"), nullable=True, index=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True, index=True
    )
    tratamiento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tratamientos_catalogo.id"), nullable=True, index=True
    )
    presupuesto_linea_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presupuesto_lineas.id"), nullable=True, index=True
    )
    cita_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True, index=True
    )
    historial_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("historial_clinico.id"), nullable=True, index=True
    )
    titulo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pieza_dental: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    caras: Mapped[str | None] = mapped_column(String(10), nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        EstadoSesionItemEnum, nullable=False, default="planificado", index=True
    )
    origen: Mapped[str] = mapped_column(
        OrigenSesionItemEnum, nullable=False, default="manual", index=True
    )
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    paciente: Mapped["Paciente"] = relationship("Paciente")  # noqa: F821
    clinica: Mapped["Clinica | None"] = relationship("Clinica")  # noqa: F821
    doctor: Mapped["Doctor | None"] = relationship("Doctor")  # noqa: F821
    tratamiento: Mapped["TratamientoCatalogo | None"] = relationship("TratamientoCatalogo")  # noqa: F821
    presupuesto_linea: Mapped["PresupuestoLinea | None"] = relationship("PresupuestoLinea")  # noqa: F821
    cita: Mapped["Cita | None"] = relationship("Cita")  # noqa: F821
    historial: Mapped["HistorialClinico | None"] = relationship("HistorialClinico")  # noqa: F821
