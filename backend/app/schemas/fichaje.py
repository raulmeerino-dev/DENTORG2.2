from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TipoFichaje = Literal["entrada", "salida"]
OrigenTrabajadorFichaje = Literal["trabajador", "usuario"]


class TrabajadorFichajeResponse(BaseModel):
    id: UUID
    nombre: str
    origen: OrigenTrabajadorFichaje
    codigo: str | None = None
    rol: str | None = None
    clinica_id: UUID | None = None
    pin_configurado: bool = True


class FichajeCreate(BaseModel):
    trabajador_id: UUID
    pin: str = Field(default="", max_length=64)
    tipo: TipoFichaje


class FichajeResponse(BaseModel):
    id: UUID
    trabajador_id: UUID
    trabajador_origen: OrigenTrabajadorFichaje
    trabajador_nombre: str
    clinica_id: UUID | None = None
    fecha: date
    hora_exacta: datetime
    tipo: TipoFichaje
    equipo: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    registrado_por_usuario_id: UUID | None = None

    model_config = {"from_attributes": True}


class FichajeRegistroResponse(BaseModel):
    fichaje: FichajeResponse
    ultimo_fichaje: FichajeResponse
