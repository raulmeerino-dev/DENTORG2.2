import uuid
from datetime import date

from pydantic import BaseModel, Field


class DocumentoPdfCreate(BaseModel):
    titulo: str = Field(..., max_length=180)
    categoria: str = Field("otro", max_length=50)
    contenido: str = Field(..., max_length=20000)
    descripcion: str | None = Field(None, max_length=500)
    etiquetas: str | None = Field(None, max_length=500)
    fecha_documento: date | None = None
    tratamiento_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    firma_data_url: str | None = None
