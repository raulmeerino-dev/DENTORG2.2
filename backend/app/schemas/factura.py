"""
Pydantic schemas para facturas, líneas de factura, cobros y formas de pago.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


# ─── Historial sin facturar ──────────────────────────────────────────────────

class HistorialSinFacturarResponse(BaseModel):
    id: UUID
    fecha: date
    pieza_dental: int | None
    caras: str | None
    observaciones: str | None
    tratamiento_id: UUID
    tratamiento_nombre: str
    tratamiento_precio: Decimal
    tratamiento_iva: Decimal
    doctor_id: UUID
    doctor_nombre: str

    model_config = {"from_attributes": False}


# ─── Formas de pago ───────────────────────────────────────────────────────────

class FormaPagoCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=50)


class FormaPagoResponse(BaseModel):
    id: UUID
    nombre: str
    activo: bool

    model_config = {"from_attributes": True}


# ─── Líneas de factura ────────────────────────────────────────────────────────

class FacturaLineaCreate(BaseModel):
    historial_id: UUID | None = None
    concepto: str = Field(..., min_length=1, max_length=200)
    concepto_ficticio: str | None = Field(None, max_length=200)
    cantidad: int = Field(1, ge=1)
    precio_unitario: Decimal = Field(..., ge=0)
    iva_porcentaje: Decimal = Field(Decimal("0.00"), ge=0, le=100)


class FacturaLineaResponse(BaseModel):
    id: UUID
    factura_id: UUID
    historial_id: UUID | None
    concepto: str
    concepto_ficticio: str | None
    cantidad: int
    precio_unitario: Decimal
    iva_porcentaje: Decimal
    subtotal: Decimal

    model_config = {"from_attributes": True}


# ─── Cobros ───────────────────────────────────────────────────────────────────

class CobroCreate(BaseModel):
    importe: Decimal = Field(..., gt=0)
    forma_pago_id: UUID
    notas: str | None = None


class CobroAnulacionCreate(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=500)


class CobroResponse(BaseModel):
    id: UUID
    factura_id: UUID
    fecha: datetime
    importe: Decimal
    forma_pago_id: UUID
    forma_pago: FormaPagoResponse | None = None
    usuario_id: UUID
    notas: str | None
    anulado_at: datetime | None = None
    anulado_por_id: UUID | None = None
    motivo_anulacion: str | None = None

    model_config = {"from_attributes": True}


# ─── Resúmenes para relaciones ────────────────────────────────────────────────

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


class EntidadResumen(BaseModel):
    id: UUID
    nombre: str

    model_config = {"from_attributes": True}


# ─── Factura ──────────────────────────────────────────────────────────────────

class FacturaCreate(BaseModel):
    paciente_id: UUID
    entidad_id: UUID | None = None
    serie: str = Field("A", min_length=1, max_length=5)
    fecha: date
    tipo: str = Field("paciente", pattern=r"^(paciente|iguala|entidad)$")
    forma_pago_id: UUID | None = None
    observaciones: str | None = None
    lineas: list[FacturaLineaCreate] = Field(default_factory=list)


class FacturaUpdate(BaseModel):
    estado: str | None = Field(None, pattern=r"^(emitida|cobrada|parcial|anulada)$")
    forma_pago_id: UUID | None = None
    observaciones: str | None = None


class FacturaRectificativaCreate(BaseModel):
    motivo: str = Field(..., min_length=5, max_length=500)
    serie: str | None = Field(None, min_length=1, max_length=5)
    fecha: date
    forma_pago_id: UUID | None = None
    observaciones: str | None = None
    lineas: list[FacturaLineaCreate] = Field(default_factory=list)


class FacturaResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    entidad_id: UUID | None
    serie: str
    numero: int
    fecha: date
    tipo: str
    subtotal: Decimal
    iva_total: Decimal
    total: Decimal
    estado: str
    forma_pago_id: UUID | None
    forma_pago: FormaPagoResponse | None = None
    observaciones: str | None
    huella: str | None = None
    num_registro: int | None = None
    estado_verifactu: str | None = None
    enviada_aeat_at: datetime | None = None
    es_rectificativa: bool = False
    factura_rectificada_id: UUID | None = None
    tiene_receta_electronica: bool = False
    paciente: PacienteResumen | None = None
    entidad: EntidadResumen | None = None
    lineas: list[FacturaLineaResponse] = []
    cobros: list[CobroResponse] = []

    @computed_field  # type: ignore[misc]
    @property
    def total_cobrado(self) -> Decimal:
        return sum(c.importe for c in self.cobros if c.anulado_at is None)

    @computed_field  # type: ignore[misc]
    @property
    def pendiente(self) -> Decimal:
        return self.total - self.total_cobrado

    model_config = {"from_attributes": True}
