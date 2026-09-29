"""Explicit assessment input; stored with the patient's existing encrypted health data."""
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ValoracionData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    fecha: date
    motivo: str = Field(default="", max_length=10000)
    dientes_ausentes: str = Field(default="", max_length=10000)
    implantes_previos: str = Field(default="", max_length=10000)
    protesis_previas: str = Field(default="", max_length=10000)
    caries_visibles: str = Field(default="", max_length=10000)
    periodontal: str = Field(default="", max_length=10000)
    higiene: str = Field(default="", max_length=10000)
    plan_recomendado: str = Field(default="", max_length=10000)
    observaciones_boca: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def require_content(self):
        if not any(value for key, value in self.model_dump().items() if key != "fecha"):
            raise ValueError("Completa la valoración antes de guardarla.")
        return self


class ValoracionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    tipo: Literal["inicial", "posterior"]
    revision: int = Field(ge=1)
    datos: ValoracionData
