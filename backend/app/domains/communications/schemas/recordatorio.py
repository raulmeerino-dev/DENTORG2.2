from uuid import UUID

from pydantic import BaseModel, Field


class RecordatorioCreate(BaseModel):
    canal: str = Field(..., pattern=r"^(whatsapp|email|ambos)$")
    mensaje: str | None = Field(None, max_length=800)



class RecordatorioResponse(BaseModel):
    citaId: UUID
    canal: str
    estado: str
    whatsappUrl: str | None = None
    emailUrl: str | None = None
