from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DoctorCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    especialidad: str | None = Field(None, max_length=100)
    color_agenda: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    es_auxiliar: bool = False
    porcentaje: Decimal | None = Field(None, ge=0, le=100)


class DoctorUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=100)
    especialidad: str | None = None
    color_agenda: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    es_auxiliar: bool | None = None
    porcentaje: Decimal | None = Field(None, ge=0, le=100)
    activo: bool | None = None


class DoctorResponse(BaseModel):
    id: UUID
    nombre: str
    especialidad: str | None
    color_agenda: str | None
    es_auxiliar: bool
    porcentaje: Decimal | None
    activo: bool

    model_config = {"from_attributes": True}


class GabineteCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=50)


class GabineteUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=50)
    activo: bool | None = None


class GabineteResponse(BaseModel):
    id: UUID
    nombre: str
    activo: bool

    model_config = {"from_attributes": True}
