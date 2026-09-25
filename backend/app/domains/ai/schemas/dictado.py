from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DictadoContexto = Literal["ficha", "sesion", "historial"]


class DictadoTranscripcionResponse(BaseModel):
    dictado_id: UUID
    paciente_id: UUID
    transcripcion: str
    estado: Literal["transcrito"]
    proveedor: str | None = None
    audio_conservado: bool = False


class DictadoGuardarNotaRequest(BaseModel):
    request_id: UUID | None = None
    dictado_id: UUID | None = None
    texto: str = Field(..., min_length=1, max_length=10000)
    fecha: date | None = None
    cita_id: UUID | None = None
    historial_id: UUID | None = None


class DictadoEditarNotaRequest(BaseModel):
    texto: str = Field(..., min_length=1, max_length=10000)
    texto_anterior: str = Field(..., min_length=1, max_length=10000)


class DictadoNotaGuardadaResponse(BaseModel):
    dictado_id: UUID | None
    nota_id: UUID
    paciente_id: UUID
    texto: str
    fecha: date
    cita_id: UUID | None = None
    historial_id: UUID | None = None
    origen: Literal["dictado_clinico"] = "dictado_clinico"
