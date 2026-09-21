from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ProductoCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    categoria: str | None = Field(None, max_length=80)
    sku: str | None = Field(None, max_length=80)
    stock_min: int = Field(0, ge=0)
    stock_act: int = Field(0, ge=0)
    unidad: str = Field("ud", min_length=1, max_length=30)
    coste_unitario: Decimal = Field(Decimal("0.00"), ge=0)
    proveedor_id: UUID | None = None
    clinica_id: UUID | None = None



class ProductoUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=150)
    categoria: str | None = Field(None, max_length=80)
    sku: str | None = Field(None, max_length=80)
    stock_min: int | None = Field(None, ge=0)
    stock_act: int | None = Field(None, ge=0)
    unidad: str | None = Field(None, min_length=1, max_length=30)
    coste_unitario: Decimal | None = Field(None, ge=0)
    proveedor_id: UUID | None = None
    clinica_id: UUID | None = None
    activo: bool | None = None



class ProductoResponse(BaseModel):
    id: UUID
    clinica_id: UUID | None
    nombre: str
    categoria: str | None
    sku: str | None
    stock_min: int
    stock_act: int
    unidad: str
    coste_unitario: Decimal
    proveedor_id: UUID | None
    activo: bool

    model_config = {"from_attributes": True}



class MovimientoInventarioCreate(BaseModel):
    tipo: str = Field(..., pattern=r"^(entrada|salida|ajuste|consumo_factura)$")
    cantidad: int = Field(..., gt=0)
    motivo: str | None = Field(None, max_length=500)
    factura_id: UUID | None = None
    referencia_tipo: str | None = Field(None, max_length=50)
    referencia_id: UUID | None = None



class MovimientoInventarioResponse(BaseModel):
    id: UUID
    producto_id: UUID
    tipo: str
    cantidad: int
    stock_resultante: int
    motivo: str | None
    factura_id: UUID | None
    referencia_tipo: str | None
    referencia_id: UUID | None
    usuario_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}



class ProveedorCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    contacto: str | None = Field(None, max_length=150)
    telefono: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    notas: str | None = None
    clinica_id: UUID | None = None



class ProveedorUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=150)
    contacto: str | None = Field(None, max_length=150)
    telefono: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    notas: str | None = None
    clinica_id: UUID | None = None
    activo: bool | None = None



class ProveedorResponse(BaseModel):
    id: UUID
    clinica_id: UUID | None
    nombre: str
    contacto: str | None
    telefono: str | None
    email: str | None
    notas: str | None
    activo: bool

    model_config = {"from_attributes": True}



class PedidoLineaCreate(BaseModel):
    producto_id: UUID
    cantidad: int = Field(..., gt=0)
    coste_unitario: Decimal = Field(Decimal("0.00"), ge=0)



class PedidoLineaResponse(BaseModel):
    id: UUID
    pedido_id: UUID
    producto_id: UUID
    cantidad: int
    coste_unitario: Decimal

    model_config = {"from_attributes": True}



class PedidoProveedorCreate(BaseModel):
    proveedor_id: UUID
    fecha: date | None = None
    notas: str | None = None
    clinica_id: UUID | None = None
    lineas: list[PedidoLineaCreate] = Field(default_factory=list)



class PedidoProveedorUpdate(BaseModel):
    estado: str | None = Field(None, pattern=r"^(borrador|enviado|recibido|cancelado)$")
    fecha: date | None = None
    notas: str | None = None
    lineas: list[PedidoLineaCreate] | None = None



class PedidoProveedorResponse(BaseModel):
    id: UUID
    proveedor_id: UUID
    clinica_id: UUID | None
    estado: str
    fecha: date
    notas: str | None
    lineas: list[PedidoLineaResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}
