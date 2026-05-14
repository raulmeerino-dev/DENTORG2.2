"""
Schemas Pydantic para Paciente.

Los campos sensibles (dni_nie, telefono, telefono2, email) se cifran en la BD con
pgcrypto. El backend los descifra antes de devolver la respuesta, y los cifra antes
de escribir en la BD. Los schemas trabajan siempre con strings en claro.
"""
import re
from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

DNI_NIE_RE = re.compile(r"^[0-9XYZ][0-9]{7}[A-Z]$", re.IGNORECASE)
PHONE_RE = re.compile(r"^[+0-9 ()-]{6,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class PacienteBase(BaseModel):
    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def empty_email_to_none(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        stripped = value.strip()
        if not EMAIL_RE.match(stripped):
            raise ValueError("Email no válido")
        return stripped

    @field_validator("telefono", "telefono2", mode="before", check_fields=False)
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        stripped = value.strip()
        if not PHONE_RE.match(stripped):
            raise ValueError("Teléfono no válido")
        return stripped

    @field_validator("dni_nie", mode="before", check_fields=False)
    @classmethod
    def validate_dni_nie(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        normalized = value.strip().upper().replace(" ", "").replace("-", "")
        if not DNI_NIE_RE.match(normalized):
            raise ValueError("DNI/NIE no válido")
        return normalized

    @field_validator("fecha_nacimiento", check_fields=False)
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("La fecha de nacimiento no puede ser futura")
        return value


class PacienteCreate(PacienteBase):
    nombre: str = Field(..., min_length=1, max_length=100)
    apellidos: str = Field(..., min_length=1, max_length=150)
    fecha_nacimiento: date | None = None
    # Campos cifrados (se reciben en claro, se cifran en BD)
    dni_nie: str | None = Field(None, max_length=20)
    telefono: str | None = Field(None, max_length=20)
    telefono2: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=200)
    # Resto de campos
    direccion: str | None = None
    codigo_postal: str | None = Field(None, max_length=10)
    ciudad: str | None = Field(None, max_length=100)
    provincia: str | None = Field(None, max_length=100)
    entidad_id: UUID | None = None
    entidad_alt_id: UUID | None = None
    no_correo: bool = False
    observaciones: str | None = None
    datos_salud: dict[str, Any] | None = None
    clinica_id: UUID | None = None


class PacienteUpdate(PacienteBase):
    nombre: str | None = Field(None, max_length=100)
    apellidos: str | None = Field(None, max_length=150)
    fecha_nacimiento: date | None = None
    dni_nie: str | None = Field(None, max_length=20)
    telefono: str | None = Field(None, max_length=20)
    telefono2: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=200)
    direccion: str | None = None
    codigo_postal: str | None = Field(None, max_length=10)
    ciudad: str | None = Field(None, max_length=100)
    provincia: str | None = Field(None, max_length=100)
    entidad_id: UUID | None = None
    entidad_alt_id: UUID | None = None
    no_correo: bool | None = None
    observaciones: str | None = None
    datos_salud: dict[str, Any] | None = None
    activo: bool | None = None
    clinica_id: UUID | None = None


class ReferenciaResponse(BaseModel):
    id: UUID
    nombre: str
    color: str | None

    model_config = {"from_attributes": True}


class PacienteResponse(BaseModel):
    id: UUID
    codigo: str | None
    num_historial: int
    nombre: str
    apellidos: str
    fecha_nacimiento: date | None
    # Campos descifrados (str en la respuesta, nunca bytes)
    dni_nie: str | None = None
    telefono: str | None = None
    telefono2: str | None = None
    email: str | None = None
    direccion: str | None
    codigo_postal: str | None
    ciudad: str | None
    provincia: str | None
    entidad_id: UUID | None
    entidad_alt_id: UUID | None
    no_correo: bool
    foto_path: str | None
    observaciones: str | None
    datos_salud: dict[str, Any] | None = None
    activo: bool
    clinica_id: UUID | None = None
    referencias: list[ReferenciaResponse] = []

    model_config = {"from_attributes": True}


class PacienteResumen(BaseModel):
    """Versión compacta para búsqueda global y listas."""
    id: UUID
    num_historial: int
    nombre: str
    apellidos: str
    fecha_nacimiento: date | None
    telefono: str | None = None
    activo: bool

    model_config = {"from_attributes": True}


class ReferenciaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class AsignarReferenciasRequest(BaseModel):
    referencia_ids: list[UUID]
