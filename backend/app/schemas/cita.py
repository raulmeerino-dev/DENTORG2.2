from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.enums import EstadoCita

ESTADOS_CITA = tuple(item.value for item in EstadoCita)


class CitaCreate(BaseModel):
    paciente_id: UUID
    doctor_id: UUID
    gabinete_id: UUID | None = None
    presupuesto_linea_id: UUID | None = None
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
    presupuesto_linea_id: UUID | None = None
    fecha_hora: datetime | None = None
    duracion_min: int | None = Field(None, ge=10, le=480)
    estado: EstadoCita | None = None
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


class CitaReprogramar(BaseModel):
    doctor_id: UUID | None = None
    gabinete_id: UUID | None = None
    fecha_hora: datetime
    duracion_min: int | None = Field(None, ge=10, le=480)
    forzar_fuera_horario: bool = False
    motivo: str | None = Field(None, max_length=500)


class CitaEstadoUpdate(BaseModel):
    estado: EstadoCita
    motivo: str | None = Field(None, max_length=500)


class CitaCancelar(BaseModel):
    motivo_cancelacion: str = Field(..., min_length=1, max_length=120)
    tipo: str = Field("anulacion_paciente", pattern=r"^(anulacion_paciente|anulacion_clinica|no_vino|reprogramada|otro)$")
    crear_telefonear: bool = False
    proximo_intento_at: datetime | None = None


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


class LaboratorioResumen(BaseModel):
    id: UUID
    nombre: str
    contacto: str | None = None

    model_config = {"from_attributes": True}


class TrabajoLaboratorioCitaResumen(BaseModel):
    id: UUID
    paciente_id: UUID
    doctor_id: UUID
    laboratorio_id: UUID
    cita_id: UUID | None = None
    tratamiento_id: UUID | None = None
    presupuesto_linea_id: UUID | None = None
    tipo_trabajo: str | None = None
    descripcion: str
    pieza_dental: int | None = None
    observaciones: str | None = None
    fecha_salida: date | None = None
    fecha_entrega_prevista: date | None = None
    fecha_recepcion: date | None = None
    fecha_revision: date | None = None
    fecha_entrega_paciente: date | None = None
    ubicacion_clinica: str | None = None
    estado: str
    colocado: bool = False
    material_enviado: bool = False
    material_devuelto: bool = False
    laboratorio: LaboratorioResumen | None = None

    model_config = {"from_attributes": True}


class CitaResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    clinica_id: UUID | None = None
    doctor_id: UUID
    gabinete_id: UUID | None
    presupuesto_linea_id: UUID | None
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
    laboratorio: list[TrabajoLaboratorioCitaResumen] = Field(default_factory=list)

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


class DisponibilidadDia(BaseModel):
    doctor_id: UUID
    fecha: datetime
    bloques: list[dict]
    intervalo_min: int
    trabaja: bool


class CitaCambioResponse(BaseModel):
    id: UUID
    cita_id: UUID
    usuario_id: UUID | None
    accion: str
    estado_anterior: str | None
    estado_nuevo: str | None
    fecha_anterior: datetime | None
    fecha_nueva: datetime | None
    doctor_anterior_id: UUID | None
    doctor_nuevo_id: UUID | None
    motivo: str | None
    datos: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


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
