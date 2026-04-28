from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class BloqueHorario(BaseModel):
    """Franja horaria dentro de un día: {"inicio": "09:00", "fin": "14:00"}"""
    inicio: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    fin: str = Field(..., pattern=r"^\d{2}:\d{2}$")

    @model_validator(mode="after")
    def inicio_antes_fin(self) -> "BloqueHorario":
        if self.inicio >= self.fin:
            raise ValueError("inicio debe ser anterior a fin")
        return self


class HorarioDoctorCreate(BaseModel):
    doctor_id: UUID
    dia_semana: int = Field(..., ge=0, le=6)  # 0=Lunes, 6=Domingo
    tipo_dia: str = Field("laborable", pattern=r"^(laborable|semilaborable|festivo)$")
    bloques: list[BloqueHorario] = Field(default_factory=list)
    intervalo_min: int = Field(10, ge=10, le=60, multiple_of=5)


class HorarioDoctorUpdate(BaseModel):
    tipo_dia: str | None = Field(None, pattern=r"^(laborable|semilaborable|festivo)$")
    bloques: list[BloqueHorario] | None = None
    intervalo_min: int | None = Field(None, ge=10, le=60)


class HorarioDoctorResponse(BaseModel):
    id: UUID
    doctor_id: UUID
    dia_semana: int
    tipo_dia: str
    bloques: list[BloqueHorario]
    intervalo_min: int

    model_config = {"from_attributes": True}


class HorarioExcepcionCreate(BaseModel):
    doctor_id: UUID | None = None
    fecha: date
    tipo_dia: str = Field(..., pattern=r"^(laborable|semilaborable|festivo)$")
    bloques: list[BloqueHorario] | None = None
    no_trabaja: bool = False


class HorarioExcepcionResponse(BaseModel):
    id: UUID
    doctor_id: UUID
    fecha: date
    tipo_dia: str
    bloques: list[BloqueHorario] | None
    no_trabaja: bool

    model_config = {"from_attributes": True}
