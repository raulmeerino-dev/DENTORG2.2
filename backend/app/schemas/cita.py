from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


ESTADOS_CITA = ("programada", "confirmada", "en_clinica", "atendida", "falta", "anulada")


class CitaCreate(BaseModel):
    paciente_id: UUID
    doctor_id: UUID
    gabinete_id: UUID | None = None
    fecha_hora: datetime
    duracion_min: int = Field(30, ge=10, le=480, multiple_of=10)
    es_urgencia: bool = False
    forzar_fuera_horario: bool = False
    motivo: str | None = Field(None, max_length=500)
    observaciones: str | None = Field(None, max_length=1000)
    recordatorio_enviado: bool = False
    recordatorio_canal: str | None = Field(None, max_length=20)
    recordatorio_estado: str | None = Field(None, max_length=30)
    recordatorio_at: datetime | None = None
    motivo_cancelacion: str | None = Field(None, max_length=80)


class CitaUpdate(BaseModel):
    doctor_id: UUID | None = None
    gabinete_id: UUID | None = None
    fecha_hora: datetime | None = None
    duracion_min: int | None = Field(None, ge=10, le=480)
    estado: str | None = Field(None, pattern=r"^(programada|confirmada|en_clinica|atendida|falta|anulada)$")
    es_urgencia: bool | None = None
    forzar_fuera_horario: bool | None = None
    motivo: str | None = None
    observaciones: str | None = None
    recordatorio_enviado: bool | None = None
    recordatorio_canal: str | None = Field(None, max_length=20)
    recordatorio_estado: str | None = Field(None, max_length=30)
    recordatorio_at: datetime | None = None
    confirmado_at: datetime | None = None
    motivo_cancelacion: str | None = Field(None, max_length=80)


class PacienteResumen(BaseModel):
    id: UUID
    nombre: str
    apellidos: str
    num_historial: int
    telefono: str | None = None  # Descifrado — necesario para recordatorios WhatsApp

    model_config = {"from_attributes": True}


class DoctorResumen(BaseModel):
    id: UUID
    nombre: str
    color_agenda: str | None

    model_config = {"from_attributes": True}


class CitaResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    doctor_id: UUID
    gabinete_id: UUID | None
    fecha_hora: datetime
    duracion_min: int
    estado: str
    es_urgencia: bool
    motivo: str | None
    observaciones: str | None
    recordatorio_enviado: bool
    recordatorio_canal: str | None
    recordatorio_estado: str | None
    recordatorio_at: datetime | None
    confirmado_at: datetime | None
    motivo_cancelacion: str | None
    # Datos denormalizados para UI
    paciente: PacienteResumen | None = None
    doctor: DoctorResumen | None = None

    model_config = {"from_attributes": True}


class BuscarHuecoRequest(BaseModel):
    doctor_id: UUID
    duracion_min: int = Field(30, ge=10, le=480, multiple_of=10)
    desde: datetime
    hasta: datetime
    solo_manana: bool = False  # Si true, solo devuelve huecos antes de las 14h
    solo_tarde: bool = False   # Si true, solo devuelve huecos desde las 14h


class HuecoLibre(BaseModel):
    doctor_id: UUID
    fecha_hora_inicio: datetime
    fecha_hora_fin: datetime
    duracion_min: int


class CitaTelefonearCreate(BaseModel):
    cita_original_id: UUID
    paciente_id: UUID
    doctor_id: UUID
    motivo: str | None = None
    notas: str | None = None
    estado_contacto: str = Field("pendiente", pattern=r"^(pendiente|contactado|no_responde|cita_dada|rechazado)$")
    ultimo_intento_at: datetime | None = None
    proximo_intento_at: datetime | None = None


class CitaTelefonearUpdate(BaseModel):
    motivo: str | None = None
    notas: str | None = None
    estado_contacto: str | None = Field(None, pattern=r"^(pendiente|contactado|no_responde|cita_dada|rechazado)$")
    ultimo_intento_at: datetime | None = None
    proximo_intento_at: datetime | None = None


class CitaTelefonearResponse(BaseModel):
    id: UUID
    cita_original_id: UUID
    paciente_id: UUID
    doctor_id: UUID
    motivo: str | None
    notas: str | None
    estado_contacto: str
    ultimo_intento_at: datetime | None
    proximo_intento_at: datetime | None
    reubicada: bool
    nueva_cita_id: UUID | None
    paciente: PacienteResumen | None = None
    doctor: DoctorResumen | None = None

    model_config = {"from_attributes": True}
