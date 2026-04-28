from uuid import UUID

from pydantic import BaseModel, Field


class UsuarioCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    nombre: str = Field(..., min_length=1, max_length=100)
    rol: str = Field(..., pattern="^(recepcion|doctor|admin)$")
    doctor_id: UUID | None = None


class UsuarioUpdate(BaseModel):
    nombre: str | None = Field(None, max_length=100)
    rol: str | None = Field(None, pattern="^(recepcion|doctor|admin)$")
    doctor_id: UUID | None = None
    activo: bool | None = None


class UsuarioResponse(BaseModel):
    id: UUID
    username: str
    nombre: str
    rol: str
    doctor_id: UUID | None
    activo: bool

    model_config = {"from_attributes": True}
