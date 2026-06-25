from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ClinicaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    direccion: str | None = None
    telefono: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    cif: str | None = Field(None, max_length=20)


class ClinicaUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=150)
    direccion: str | None = None
    telefono: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    cif: str | None = Field(None, max_length=20)
    activa: bool | None = None


class ClinicaResponse(ClinicaCreate):
    id: UUID
    activa: bool

    model_config = {"from_attributes": True}


class RecordatorioCreate(BaseModel):
    canal: str = Field(..., pattern=r"^(whatsapp|email|ambos)$")
    mensaje: str | None = Field(None, max_length=800)


class RecordatorioResponse(BaseModel):
    citaId: UUID
    canal: str
    estado: str
    whatsappUrl: str | None = None
    emailUrl: str | None = None


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


class SyncPaciente(BaseModel):
    idTemp: str
    nombre: str
    apellidos: str | None = ""
    telefono: str | None = None


class SyncCita(BaseModel):
    idTemp: str
    paciente_id: UUID | None = None
    paciente_idTemp: str | None = None
    doctor_id: UUID | None = None
    fecha_hora: datetime
    duracion_min: int = 30
    motivo: str | None = None


class SyncRequest(BaseModel):
    pacientes: list[SyncPaciente] = Field(default_factory=list)
    citas: list[SyncCita] = Field(default_factory=list)


class SyncResponse(BaseModel):
    pacientes: dict[str, UUID]
    citas: dict[str, UUID]
    pendientes: int = 0


class ImportPaciente(BaseModel):
    nombre: str
    apellidos: str | None = ""
    dni_nie: str | None = None
    telefono: str | None = None
    email: str | None = None


class ImportResponse(BaseModel):
    creados: int
    errores: list[dict]


class TwoFactorEnableResponse(BaseModel):
    secret: str
    otpauthUrl: str
    qrDataUrl: str


class IngresosResponse(BaseModel):
    total: float
    pac: float
    seg: float


class BackupRegistroResponse(BaseModel):
    id: UUID
    tipo: str
    alcance: str = "full"
    estado: str
    ubicacion: str | None
    destino_externo: str | None = None
    hash_sha256: str | None
    tamano_bytes: int | None
    cifrado: bool
    incluye_bd: bool = True
    incluye_uploads: bool = True
    verificado_at: datetime | None = None
    restauracion_probada_at: datetime | None = None
    restauracion_resultado: str | None = None
    retention_expires_at: datetime | None = None
    retention_days: int | None = None
    error: str | None
    created_by_id: UUID | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
