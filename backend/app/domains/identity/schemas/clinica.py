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
