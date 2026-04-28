from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


# ─── Líneas ───────────────────────────────────────────────────────────────────

class PresupuestoLineaCreate(BaseModel):
    tratamiento_id: UUID
    pieza_dental: int | None = Field(None, ge=11, le=85)
    caras: str | None = Field(None, max_length=10)
    precio_unitario: Decimal = Field(..., ge=0)
    descuento_porcentaje: Decimal = Field(Decimal("0"), ge=0, le=100)


class PresupuestoLineaUpdate(BaseModel):
    precio_unitario: Decimal | None = Field(None, ge=0)
    descuento_porcentaje: Decimal | None = Field(None, ge=0, le=100)
    aceptado: bool | None = None
    pieza_dental: int | None = None
    caras: str | None = None


class TratamientoResumen(BaseModel):
    id: UUID
    nombre: str
    codigo: str | None

    model_config = {"from_attributes": True}


class PresupuestoLineaResponse(BaseModel):
    id: UUID
    presupuesto_id: UUID
    tratamiento_id: UUID
    tratamiento: TratamientoResumen | None = None
    pieza_dental: int | None
    caras: str | None
    precio_unitario: Decimal
    descuento_porcentaje: Decimal
    aceptado: bool
    pasado_trabajo_pendiente: bool

    @computed_field  # type: ignore[misc]
    @property
    def importe_neto(self) -> Decimal:
        return self.precio_unitario * (1 - self.descuento_porcentaje / 100)

    model_config = {"from_attributes": True}


# ─── Presupuesto ──────────────────────────────────────────────────────────────

class PresupuestoCreate(BaseModel):
    paciente_id: UUID
    doctor_id: UUID
    fecha: date
    pie_pagina: str | None = None
    lineas: list[PresupuestoLineaCreate] = Field(default_factory=list)


class PresupuestoUpdate(BaseModel):
    fecha: date | None = None
    estado: str | None = Field(None, pattern=r"^(borrador|presentado|aceptado|rechazado|parcial)$")
    pie_pagina: str | None = None
    doctor_id: UUID | None = None


class OdontogramaPlanUpdate(BaseModel):
    odontograma: dict = Field(default_factory=dict)


class OdontogramaPlanResponse(BaseModel):
    presupuesto_id: UUID
    odontograma: dict = Field(default_factory=dict)


class PacienteResumen(BaseModel):
    id: UUID
    nombre: str
    apellidos: str
    num_historial: int

    model_config = {"from_attributes": True}


class DoctorResumen(BaseModel):
    id: UUID
    nombre: str

    model_config = {"from_attributes": True}


class PresupuestoResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    numero: int
    fecha: date
    estado: str
    pie_pagina: str | None
    odontograma: dict = Field(default_factory=dict)
    doctor_id: UUID
    paciente: PacienteResumen | None = None
    doctor: DoctorResumen | None = None
    lineas: list[PresupuestoLineaResponse] = []

    @computed_field  # type: ignore[misc]
    @property
    def total(self) -> Decimal:
        return sum(l.importe_neto for l in self.lineas)

    @computed_field  # type: ignore[misc]
    @property
    def total_aceptado(self) -> Decimal:
        return sum(l.importe_neto for l in self.lineas if l.aceptado)

    model_config = {"from_attributes": True}


# ─── Trabajo Pendiente ────────────────────────────────────────────────────────

class TrabajoPendienteResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    presupuesto_linea_id: UUID
    tratamiento_id: UUID
    tratamiento: TratamientoResumen | None = None
    pieza_dental: int | None
    caras: str | None
    realizado: bool
    historial_id: UUID | None

    model_config = {"from_attributes": True}
