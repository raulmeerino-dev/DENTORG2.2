from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BackupCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alcance: str = Field("full", pattern=r"^(database|uploads|full)$")
    retention_days: int | None = Field(None, ge=1, le=3650)



class BackupRestoreProofRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resultado: str = Field(..., pattern=r"^(ok|fallido)$")
    notas: str | None = Field(None, min_length=3, max_length=2000)



class PortalInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente_id: UUID
    expires_in_hours: int = Field(168, ge=1, le=720)
    proposito: str = Field("portal_access", pattern=r"^(portal_access|documentos|consentimientos|citas)$")
    uso_unico: bool = False
    nota: str | None = Field(None, max_length=500)



class PortalInvitationResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    clinica_id: UUID | None
    proposito: str
    estado: str
    expires_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    token: str | None = None
    invite_url: str | None = None

    model_config = {"from_attributes": True}



class EntidadCreate(BaseModel):
    nombre: str
    cif: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    contacto: str | None = None



class EntidadUpdate(BaseModel):
    nombre: str | None = None
    cif: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    contacto: str | None = None
    activo: bool | None = None



class EntidadResponse(BaseModel):
    id: UUID
    nombre: str
    cif: str | None
    direccion: str | None
    telefono: str | None
    contacto: str | None
    activo: bool

    model_config = {"from_attributes": True}



class EstadoRemisionUpdate(BaseModel):
    estado_remision: str = Field(..., pattern=r"^(pendiente|enviada|rechazada|anulacion_pendiente|no_verifactu)$")
    detalle: str | None = Field(None, max_length=500)



class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    user_id: UUID | None
    clinica_id: UUID | None
    action: str
    entity_type: str
    entity_id: UUID | None
    old_values: dict | None
    new_values: dict | None
    ip_address: str | None
    user_agent: str | None
    event_hash: str | None
