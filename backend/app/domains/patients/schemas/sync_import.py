from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


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
