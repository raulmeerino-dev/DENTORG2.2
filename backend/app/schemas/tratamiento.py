from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# ─── Familias ────────────────────────────────────────────────────────────────

class FamiliaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    icono: str | None = Field(None, max_length=50)
    orden: int = Field(0, ge=0)


class FamiliaUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=100)
    icono: str | None = None
    orden: int | None = None


class FamiliaResponse(BaseModel):
    id: UUID
    nombre: str
    icono: str | None
    orden: int

    model_config = {"from_attributes": True}


# ─── Catálogo de tratamientos ─────────────────────────────────────────────────

class TratamientoCreate(BaseModel):
    familia_id: UUID
    codigo: str | None = Field(None, max_length=20)
    nombre: str = Field(..., min_length=1, max_length=150)
    precio: Decimal = Field(Decimal("0"), ge=0)
    iva_porcentaje: Decimal = Field(Decimal("0"), ge=0, le=100)
    requiere_pieza: bool = False
    requiere_caras: bool = False


class TratamientoUpdate(BaseModel):
    familia_id: UUID | None = None
    codigo: str | None = Field(None, max_length=20)
    nombre: str | None = Field(None, max_length=150)
    precio: Decimal | None = Field(None, ge=0)
    iva_porcentaje: Decimal | None = Field(None, ge=0, le=100)
    requiere_pieza: bool | None = None
    requiere_caras: bool | None = None
    activo: bool | None = None


class TratamientoResponse(BaseModel):
    id: UUID
    familia_id: UUID
    familia: FamiliaResponse | None = None
    codigo: str | None
    nombre: str
    precio: Decimal
    iva_porcentaje: Decimal
    requiere_pieza: bool
    requiere_caras: bool
    activo: bool

    model_config = {"from_attributes": True}


# ─── Historial Clínico ────────────────────────────────────────────────────────

class HistorialCreate(BaseModel):
    paciente_id: UUID
    tratamiento_id: UUID
    doctor_id: UUID
    gabinete_id: UUID | None = None
    pieza_dental: int | None = Field(None, ge=11, le=85)  # FDI: 11-48 + 51-85 (leche)
    caras: str | None = Field(None, max_length=10, pattern=r"^[MODVLP]*$")
    fecha: date
    diagnostico: str | None = None
    procedimiento: str | None = None
    observaciones: str | None = None
    estado: str = Field("realizado", max_length=30)
    importe: Decimal | None = Field(None, ge=0)
    factura_id: UUID | None = None
    origen: str | None = Field(None, max_length=30)
    presupuesto_linea_id: UUID | None = None
    cita_id: UUID | None = None


class HistorialUpdate(BaseModel):
    pieza_dental: int | None = Field(None, ge=11, le=85)
    caras: str | None = Field(None, max_length=10)
    fecha: date | None = None
    diagnostico: str | None = None
    procedimiento: str | None = None
    observaciones: str | None = None
    estado: str | None = Field(None, max_length=30)
    importe: Decimal | None = Field(None, ge=0)
    factura_id: UUID | None = None
    origen: str | None = Field(None, max_length=30)
    presupuesto_linea_id: UUID | None = None
    cita_id: UUID | None = None


class SesionTratamientoRealizadoCreate(BaseModel):
    paciente_id: UUID
    tratamiento_id: UUID
    doctor_id: UUID | None = None
    gabinete_id: UUID | None = None
    cita_id: UUID | None = None
    presupuesto_linea_id: UUID | None = None
    pieza_dental: int | None = Field(None, ge=11, le=85)
    caras: str | None = Field(None, max_length=10, pattern=r"^[MODVLP]*$")
    fecha: date | None = None
    procedimiento: str | None = Field(None, max_length=300)
    observaciones: str | None = None
    origen: Literal["manual", "cita", "presupuesto_linea"] = "manual"
    importe: Decimal | None = Field(None, ge=0)


class TratamientoResumen(BaseModel):
    id: UUID
    nombre: str
    codigo: str | None

    model_config = {"from_attributes": True}


class DoctorResumen(BaseModel):
    id: UUID
    nombre: str

    model_config = {"from_attributes": True}


class HistorialResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    tratamiento_id: UUID
    doctor_id: UUID
    gabinete_id: UUID | None
    pieza_dental: int | None
    caras: str | None
    fecha: date
    diagnostico: str | None
    procedimiento: str | None
    observaciones: str | None
    estado: str
    importe: Decimal | None
    factura_id: UUID | None
    origen: str | None = None
    presupuesto_linea_id: UUID | None = None
    cita_id: UUID | None = None
    tratamiento: TratamientoResumen | None = None
    doctor: DoctorResumen | None = None

    model_config = {"from_attributes": True}


class NotaDentalCreate(BaseModel):
    paciente_id: UUID
    pieza_dental: int = Field(..., ge=11, le=85)
    caras: str | None = Field(None, max_length=10, pattern=r"^[MODVLP]*$")
    texto: str = Field(..., min_length=1, max_length=2000)
    fecha: date | None = None
    doctor_id: UUID | None = None
    cita_id: UUID | None = None
    historial_id: UUID | None = None


class NotaDentalResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    pieza_dental: int
    caras: str | None
    texto: str
    fecha: date
    doctor_id: UUID | None
    cita_id: UUID | None
    historial_id: UUID | None
    doctor: DoctorResumen | None = None

    model_config = {"from_attributes": True}
