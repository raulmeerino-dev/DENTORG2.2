from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domains.patients.schemas.paciente import PacienteResponse


class PortalMeResponse(BaseModel):
    paciente: PacienteResponse
    resumen: dict[str, int]



class PortalSolicitarCambioCita(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field("Solicita cambiar la cita desde portal paciente", max_length=300)
    proximo_intento_at: datetime | None = None



class PortalTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(..., min_length=32, max_length=256)



class PortalPublicCancelRequest(PortalTokenRequest):
    motivo_cancelacion: str = Field("Cancelada desde portal paciente", min_length=3, max_length=500)
    reprogramar: bool = False



class PortalPublicCambioRequest(PortalTokenRequest):
    motivo: str = Field("Solicita cambiar la cita desde portal paciente", min_length=3, max_length=300)
    proximo_intento_at: datetime | None = None



class PortalPublicFirmarRequest(PortalTokenRequest):
    firma_paciente_base64: str = Field(..., min_length=30)



class PortalPublicPaciente(BaseModel):
    nombre: str
    apellidos: str



class PortalPublicMeResponse(BaseModel):
    paciente: PortalPublicPaciente
    resumen: dict[str, int]
    expires_at: datetime



class PortalPublicCitaResponse(BaseModel):
    id: UUID
    fecha_hora: datetime
    duracion_min: int
    estado: str
    motivo: str | None
    doctor_nombre: str | None = None



class PortalPublicDocumentoResponse(BaseModel):
    id: UUID
    nombre_original: str
    mime_type: str
    tamano_bytes: int
    categoria: str
    descripcion: str | None
    fecha_documento: str | None
    created_at: datetime | None



class PortalPublicConsentimientoResponse(BaseModel):
    id: UUID
    tipo: str
    estado: str
    fecha_firma: str
    firmado_at: datetime | None
    contenido: str | None
    hash_documento: str | None
    revocado: bool
