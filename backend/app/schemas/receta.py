"""Schemas Pydantic para recetas privadas/locales y proveedor externo."""
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

RecetaEstado = Literal[
    "borrador",
    "pendiente_validacion",
    "emitida_local",
    "enviada_proveedor",
    "certificada",
    "rechazada",
    "anulada",
    "dispensada",
]


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class RecetaPlantillaResponse(BaseModel):
    id: UUID
    clinica_id: UUID | None
    nombre: str
    nombre_original: str
    mime_type: str
    tamano_bytes: int
    campos_config: dict | None
    requiere_dni: bool
    requiere_fecha_nacimiento: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RecetaPlantillaUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=150)
    campos_config: dict | None = None
    requiere_dni: bool | None = None
    requiere_fecha_nacimiento: bool | None = None


class RecetaProviderStatus(BaseModel):
    mode: Literal["disabled", "mock", "real"]
    provider_available: bool
    real_certification_enabled: bool
    warning: str | None


class _RecetaBase(BaseModel):
    plantilla_id: UUID | None = None
    medicamento: str | None = Field(None, max_length=2000)
    posologia: str | None = Field(None, max_length=2000)
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
    prescriptor_num_colegiado: str | None = Field(None, max_length=80)
    prescriptor_colegio: str | None = Field(None, max_length=150)
    prescriptor_provincia: str | None = Field(None, max_length=100)
    prescriptor_especialidad: str | None = Field(None, max_length=120)
    prescriptor_nif: str | None = Field(None, max_length=30)
    firma_data_url: str | None = None

    @field_validator(
        "medicamento",
        "posologia",
        "principio_activo",
        "forma_farmaceutica",
        "via_administracion",
        "unidades",
        "duracion",
        "pauta",
        "diagnostico",
        "instrucciones_paciente",
        "instrucciones_farmacia",
        "prescriptor_num_colegiado",
        "prescriptor_colegio",
        "prescriptor_provincia",
        "prescriptor_especialidad",
        "prescriptor_nif",
        mode="before",
    )
    @classmethod
    def _strip_strings(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @field_validator("fecha_prescripcion", "fecha_dispensacion", check_fields=False)
    @classmethod
    def _no_futuras_lejanas(cls, value: date | None) -> date | None:
        if value is None:
            return value
        if (value - date.today()).days > 365:
            raise ValueError("Fecha demasiado lejana en el futuro")
        return value


class RecetaCreate(_RecetaBase):
    model_config = {"extra": "forbid"}

    doctor_id: UUID


class RecetaUpdate(_RecetaBase):
    model_config = {"extra": "forbid"}

    doctor_id: UUID | None = None


class RecetaEmitirRequest(BaseModel):
    model_config = {"extra": "forbid"}

    plantilla_id: UUID | None = None


class RecetaAnularRequest(BaseModel):
    model_config = {"extra": "forbid"}

    motivo: str = Field(..., min_length=3, max_length=500)


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
    plantilla_id: UUID | None
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
    prescriptor_nombre: str | None
    prescriptor_num_colegiado: str | None
    prescriptor_colegio: str | None
    prescriptor_provincia: str | None
    prescriptor_especialidad: str | None
    prescriptor_nif: str | None
    fecha_prescripcion: date
    fecha_dispensacion: date | None
    estado: RecetaEstado
    provider_mode: str
    external_id: str | None
    provider_status: str | None
    provider_error: str | None
    verification_code: str | None
    pdf_documento_id: UUID | None
    pdf_path: str | None
    pdf_hash_sha256: str | None
    firma_data_url: str | None
    pdf_generado_at: datetime | None
    emitida_at: datetime | None
    enviada_proveedor_at: datetime | None
    certificada_at: datetime | None
    rechazada_at: datetime | None
    anulada_at: datetime | None
    dispensada_at: datetime | None
    certificada_real: bool = False
    created_at: datetime
    doctor: RecetaDoctorOut | None = None
    plantilla: RecetaPlantillaResponse | None = None

    model_config = {"from_attributes": True}
