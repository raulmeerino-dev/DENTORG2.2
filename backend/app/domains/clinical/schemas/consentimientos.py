import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class PlantillaConsentimientoCreate(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=80)
    nombre: str = Field(..., min_length=1, max_length=150)
    tipo_tratamiento: str | None = Field(None, max_length=100)
    contenido: str = Field(..., min_length=20)
    clinica_id: uuid.UUID | None = None



class PlantillaConsentimientoResponse(BaseModel):
    id: uuid.UUID | None = None
    codigo: str
    nombre: str
    version: str
    version_num: int = 1
    tratamientos: list[str] = Field(default_factory=list)
    tipo_tratamiento: str | None = None
    contenido: str | None = None

    model_config = {"from_attributes": True}



class ConsentimientoCreate(BaseModel):
    tipo: str = Field(..., max_length=100)
    plantilla_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    documento_id: uuid.UUID | None = None
    estado: str = Field("pendiente_firma", pattern=r"^(borrador|pendiente_firma|firmado|revocado)$")
    fecha_firma: date | None = None
    documento_path: str | None = Field(None, max_length=500)
    plantilla_version: str | None = Field(None, max_length=30)
    contenido: str | None = None



class ConsentimientoUpdate(BaseModel):
    estado: str | None = Field(None, pattern=r"^(borrador|pendiente_firma|firmado|revocado)$")
    documento_id: uuid.UUID | None = None
    documento_path: str | None = Field(None, max_length=500)
    contenido: str | None = None
    revocado: bool | None = None



class ConsentimientoFirmar(BaseModel):
    model_config = {"extra": "forbid"}

    firma_paciente_base64: str = Field(..., min_length=30, max_length=3_000_000)
    firma_doctor_base64: str | None = Field(None, max_length=3_000_000)



class ConsentimientoRevocar(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=500)



class ConsentimientoResponse(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    clinica_id: uuid.UUID | None
    plantilla_id: uuid.UUID | None
    tratamiento_id: uuid.UUID | None
    doctor_id: uuid.UUID | None
    historial_id: uuid.UUID | None
    documento_id: uuid.UUID | None
    tipo: str
    estado: str
    fecha_firma: date
    firmado_at: datetime | None
    documento_path: str | None
    plantilla_version: str | None
    version_plantilla: int | None
    contenido: str | None
    hash_documento: str | None
    revocado: bool
    fecha_revocacion: date | None
    motivo_revocacion: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
