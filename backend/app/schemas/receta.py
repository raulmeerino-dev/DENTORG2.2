"""
Schemas Pydantic para recetas clinicas.

Campos explícitos — el endpoint NO acepta payload arbitrario.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class _RecetaBase(BaseModel):
    @field_validator(
        "medicamento", "posologia", mode="before", check_fields=False,
    )
    @classmethod
    def _required_non_empty(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("Campo obligatorio")
        return value.strip()

    @field_validator("fecha_prescripcion", "fecha_dispensacion", check_fields=False)
    @classmethod
    def _no_futuras_dispensacion(cls, value: date | None) -> date | None:
        # fecha_prescripcion puede ser hoy; fecha_dispensacion idem.
        # Permite fechas pasadas (regularizaciones), pero no más de 1 año en el futuro.
        if value is None:
            return value
        if (value - date.today()).days > 365:
            raise ValueError("Fecha demasiado lejana en el futuro")
        return value


class RecetaCreate(_RecetaBase):
    doctor_id: UUID
    medicamento: str = Field(..., min_length=1, max_length=2000)
    posologia: str = Field(..., min_length=1, max_length=2000)
    principio_activo: str | None = Field(None, max_length=200)
    forma_farmaceutica: str | None = Field(None, max_length=100)
    via_administracion: str | None = Field(None, max_length=100)
    unidades: str | None = Field(None, max_length=100)
    duracion: str | None = Field(None, max_length=100)
    pauta: str | None = Field(None, max_length=200)
    diagnostico: str | None = Field(None, max_length=2000)
    instrucciones_paciente: str | None = Field(None, max_length=2000)
    instrucciones_farmacia: str | None = Field(None, max_length=2000)
    fecha_prescripcion: date | None = None
    fecha_dispensacion: date | None = None
    firma_data_url: str | None = None


class RecetaFirmaUpdate(BaseModel):
    firma_data_url: str = Field(..., min_length=20)

    @field_validator("firma_data_url")
    @classmethod
    def _is_data_url(cls, value: str) -> str:
        if not value.startswith("data:image/"):
            raise ValueError("La firma debe ser un data URL de imagen")
        return value


class RecetaDoctorOut(BaseModel):
    id: UUID
    nombre: str

    model_config = {"from_attributes": True}


class RecetaResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    doctor_id: UUID
    clinica_id: UUID | None
    medicamento: str
    principio_activo: str | None
    forma_farmaceutica: str | None
    via_administracion: str | None
    unidades: str | None
    duracion: str | None
    posologia: str
    pauta: str | None
    diagnostico: str | None
    instrucciones_paciente: str | None
    instrucciones_farmacia: str | None
    fecha_prescripcion: date
    fecha_dispensacion: date | None
    firma_data_url: str | None
    pdf_generado_at: datetime | None
    created_at: datetime
    doctor: RecetaDoctorOut | None = None

    model_config = {"from_attributes": True}
