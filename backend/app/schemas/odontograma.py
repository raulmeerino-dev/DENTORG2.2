from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

SuperficieDental = Literal[
    "oclusal_incisal",
    "mesial",
    "distal",
    "vestibular",
    "lingual_palatina",
    "raiz",
    "lingual_palatal",
]
EstadoOdontograma = Literal[
    "sano",
    "caries",
    "obturacion",
    "endodoncia",
    "corona",
    "implante",
    "ausente",
    "extraccion_indicada",
    "fractura",
    "movilidad",
    "protesis",
    "tratamiento_pendiente",
    "tratamiento_realizado",
]


class OdontogramaSuperficieUpdate(BaseModel):
    condicion: EstadoOdontograma | None = None
    tratamiento_planificado_id: UUID | None = None
    tratamiento_realizado_id: UUID | None = None
    color_estado: str | None = Field(None, max_length=20)
    notas: str | None = None


class OdontogramaPiezaUpdate(BaseModel):
    estado_general: EstadoOdontograma | None = None
    notas: str | None = None


class OdontogramaSuperficieResponse(BaseModel):
    id: UUID
    pieza_id: UUID
    superficie: str
    condicion: str
    tratamiento_planificado_id: UUID | None
    tratamiento_realizado_id: UUID | None
    color_estado: str | None
    notas: str | None

    model_config = {"from_attributes": True}


class OdontogramaPiezaResponse(BaseModel):
    id: UUID
    odontograma_id: UUID
    pieza_fdi: int
    estado_general: str
    notas: str | None
    superficies: list[OdontogramaSuperficieResponse] = []

    model_config = {"from_attributes": True}


class OdontogramaResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    clinica_id: UUID | None
    version: int
    activo: bool
    created_at: datetime
    updated_at: datetime | None
    piezas: list[OdontogramaPiezaResponse] = []

    model_config = {"from_attributes": True}


class OdontogramaEventoResponse(BaseModel):
    id: UUID
    odontograma_id: UUID
    pieza_fdi: int | None
    superficie: str | None
    accion: str
    old_values: dict | None
    new_values: dict | None
    usuario_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlanTratamientoItem(BaseModel):
    pieza_fdi: int = Field(..., ge=11, le=85)
    superficie: SuperficieDental | None = None
    tratamiento_id: UUID
    precio_unitario: Decimal = Field(..., ge=0)


class PlanTratamientoCreate(BaseModel):
    doctor_id: UUID
    items: list[PlanTratamientoItem] | None = None
    pie_pagina: str | None = None


class PlanTratamientoResponse(BaseModel):
    presupuesto_id: UUID
    lineas_creadas: int
