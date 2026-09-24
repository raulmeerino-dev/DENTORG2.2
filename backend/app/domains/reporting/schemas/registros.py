"""Typed, allowlisted contracts for the cross-domain read workspace."""
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class RegistroFilters(BaseModel):
    q: str | None = Field(None, max_length=200)
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    paciente_id: UUID | None = None
    doctor_id: UUID | None = None
    clinica_id: UUID | None = None
    tratamiento_id: UUID | None = None
    tipo: str | None = Field(None, max_length=80)
    estado: str | None = Field(None, max_length=80)
    importe_min: Decimal | None = None
    importe_max: Decimal | None = None
    saldo_min: Decimal | None = None
    saldo_max: Decimal | None = None
    sort_by: str | None = Field(None, max_length=40)
    sort_dir: Literal["asc", "desc"] = "desc"
    offset: int = Field(0, ge=0, le=10_000_000)
    limit: int = Field(50, ge=1, le=200)

    @model_validator(mode="after")
    def valid_ranges(self):
        for start, end in ((self.fecha_desde, self.fecha_hasta), (self.importe_min, self.importe_max), (self.saldo_min, self.saldo_max)):
            if start is not None and end is not None and start > end:
                raise ValueError("El inicio del rango no puede superar el final")
        return self


class RegistroColumn(BaseModel):
    key: str
    label: str
    type: Literal["text", "number", "money", "date", "datetime", "status"] = "text"
    sortable: bool = True


class RegistroOption(BaseModel):
    value: str
    label: str


class RegistroSort(BaseModel):
    by: str
    dir: Literal["asc", "desc"] = "desc"


class RegistroView(BaseModel):
    id: str
    label: str
    group: Literal["records", "files"] = "records"
    filters: list[str]
    states: list[RegistroOption] = Field(default_factory=list)
    types: list[RegistroOption] = Field(default_factory=list)
    columns: list[RegistroColumn]
    can_export: bool = True
    export_formats: list[str] = Field(default_factory=lambda: ["csv", "xlsx", "pdf"])
    default_sort: RegistroSort
    date_label: str = "Fecha"


class RegistroCatalogo(BaseModel):
    views: list[RegistroView]


class RegistroTarget(BaseModel):
    kind: str
    id: str
    patient_id: str | None = None
    date: str | None = None
    doctor_id: str | None = None


class RegistroRow(BaseModel):
    id: str
    cells: dict[str, str | int | float | bool | None]
    target: RegistroTarget


class RegistroResult(BaseModel):
    columns: list[RegistroColumn]
    rows: list[RegistroRow]
    total: int
    offset: int
    limit: int


class RegistroLookup(BaseModel):
    id: str
    label: str
