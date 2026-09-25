from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CargoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    historial_id: UUID | None
    factura_id: UUID | None
    cita_id: UUID | None
    doctor_id: UUID | None
    concepto: str
    fecha: date
    pieza_dental: int | None
    caras: str | None
    importe: Decimal | None
    cobrado: Decimal = Decimal("0")
    pendiente: Decimal = Decimal("0")
    motivo_cero: str | None
    origen: str


class AplicacionResponse(BaseModel):
    cargo_id: UUID
    importe: Decimal


class MovimientoResponse(BaseModel):
    id: UUID
    tipo: str
    fecha: datetime
    importe: Decimal
    forma_pago: str
    aplicado: Decimal
    anulado: bool
    factura_id: UUID | None = None
    concepto: str | None = None
    notas: str | None = None
    motivo_anulacion: str | None = None
    registrado_por: str | None = None
    aplicaciones: list[AplicacionResponse] = Field(default_factory=list)
    saldo_tras_operacion: Decimal | None = None


class CuentaResponse(BaseModel):
    paciente_id: UUID
    paciente_nombre: str
    version: str
    cargos: list[CargoResponse]
    movimientos: list[MovimientoResponse]
    total_cargos: Decimal
    total_cobrado: Decimal
    pendiente_cargos: Decimal
    saldo_favor: Decimal
    saldo: Decimal
    realizado_hoy: Decimal
    saldo_anterior: Decimal
    sin_valorar: int
    cita_id: UUID | None = None
    doctor_id: UUID | None = None
    gabinete_id: UUID | None = None
    pendiente_salida: bool = False


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    version: str = Field(min_length=64, max_length=64)
    importe: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    forma_pago_id: UUID | None = None
    usar_saldo_favor: bool = True
    cita_id: UUID | None = None
    resolver_salida: bool = False
    notas: str | None = Field(default=None, max_length=500)


class CheckoutResponse(BaseModel):
    operacion_id: UUID
    cobro_id: UUID | None
    importe_recibido: Decimal
    saldo_aplicado: Decimal
    saldo_pendiente: Decimal
    salida_resuelta: bool


class FacturarCargosRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    cargo_ids: list[UUID] = Field(min_length=1, max_length=200)
    serie: str = Field(default="A", min_length=1, max_length=5)


class ValorarCargoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    motivo: str = Field(min_length=3, max_length=500)


class CuentaListaItem(BaseModel):
    id: UUID
    nombre: str
    apellidos: str
    num_historial: int
    total_cargos: Decimal
    total_cobrado: Decimal
    saldo: Decimal
    sin_valorar: int


class CuentaListaResponse(BaseModel):
    items: list[CuentaListaItem]
    total: int
