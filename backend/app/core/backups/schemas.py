from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BackupRegistroResponse(BaseModel):
    id: UUID
    tipo: str
    alcance: str = "full"
    estado: str
    ubicacion: str | None
    destino_externo: str | None = None
    hash_sha256: str | None
    tamano_bytes: int | None
    cifrado: bool
    incluye_bd: bool = True
    incluye_uploads: bool = True
    verificado_at: datetime | None = None
    restauracion_probada_at: datetime | None = None
    restauracion_resultado: str | None = None
    retention_expires_at: datetime | None = None
    retention_days: int | None = None
    error: str | None
    created_by_id: UUID | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
