from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ClinicaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    direccion: str | None = None
    telefono: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=200)
    cif: str | None = Field(None, max_length=20)


class ClinicaResponse(ClinicaCreate):
    id: UUID
    activa: bool

    model_config = {"from_attributes": True}


class VideoResponse(BaseModel):
    citaId: UUID
    videoUrl: str
    estado: str


class ProductoCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    stock_min: int = Field(0, ge=0)
    stock_act: int = Field(0, ge=0)
    proveedor_id: UUID | None = None


class ProductoUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=150)
    stock_min: int | None = Field(None, ge=0)
    stock_act: int | None = Field(None, ge=0)
    proveedor_id: UUID | None = None
    activo: bool | None = None


class ProductoResponse(BaseModel):
    id: UUID
    nombre: str
    stock_min: int
    stock_act: int
    proveedor_id: UUID | None
    activo: bool

    model_config = {"from_attributes": True}


class MovimientoInventarioCreate(BaseModel):
    tipo: str = Field(..., pattern=r"^(entrada|salida|ajuste|consumo_factura)$")
    cantidad: int = Field(..., gt=0)
    motivo: str | None = Field(None, max_length=500)
    factura_id: UUID | None = None


class MovimientoInventarioResponse(BaseModel):
    id: UUID
    producto_id: UUID
    tipo: str
    cantidad: int
    stock_resultante: int
    motivo: str | None
    factura_id: UUID | None
    usuario_id: UUID | None
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
    estado: str
    ubicacion: str | None
    hash_sha256: str | None
    tamano_bytes: int | None
    cifrado: bool
    error: str | None
    created_by_id: UUID | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
