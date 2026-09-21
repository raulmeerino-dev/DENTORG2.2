import uuid
from datetime import date

from pydantic import BaseModel, Field


class LaboratorioCreate(BaseModel):
    nombre: str
    telefono: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    contacto: str | None = None
    notas: str | None = None



class LaboratorioUpdate(BaseModel):
    nombre: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    contacto: str | None = None
    notas: str | None = None
    activo: bool | None = None



class LaboratorioResponse(BaseModel):
    id: uuid.UUID
    nombre: str
    telefono: str | None
    whatsapp: str | None
    email: str | None
    contacto: str | None
    notas: str | None
    activo: bool
    model_config = {"from_attributes": True}



class TrabajoCreate(BaseModel):
    paciente_id: uuid.UUID
    doctor_id: uuid.UUID
    laboratorio_id: uuid.UUID
    historial_id: uuid.UUID | None = None
    cita_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    presupuesto_id: uuid.UUID | None = None
    presupuesto_linea_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    referencia_interna: str | None = None
    referencia_proveedor: str | None = None
    tipo_trabajo: str | None = None
    descripcion: str
    pieza_dental: int | None = None
    color: str | None = None
    observaciones: str | None = None
    fecha_salida: date | None = None
    fecha_entrega_prevista: date | None = None
    estado: str = "pending_to_send"
    ubicacion_clinica: str | None = Field(None, max_length=120)
    precio: float | None = None
    coste_laboratorio: float | None = None
    precio_paciente: float | None = None
    margen: float | None = None
    comision_doctor_pct: float | None = None
    estado_pago_laboratorio: str = "pendiente"
    estado_cobro_paciente: str = "pendiente"
    material_enviado: bool | None = None



class TrabajoUpdate(BaseModel):
    laboratorio_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    cita_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    presupuesto_id: uuid.UUID | None = None
    presupuesto_linea_id: uuid.UUID | None = None
    factura_id: uuid.UUID | None = None
    referencia: str | None = None
    referencia_interna: str | None = None
    referencia_proveedor: str | None = None
    tipo_trabajo: str | None = None
    descripcion: str | None = None
    pieza_dental: int | None = None
    color: str | None = None
    observaciones: str | None = None
    fecha_salida: date | None = None
    fecha_entrega_prevista: date | None = None
    fecha_recepcion: date | None = None
    fecha_revision: date | None = None
    fecha_entrega_paciente: date | None = None
    ubicacion_clinica: str | None = Field(None, max_length=120)
    estado: str | None = None
    precio: float | None = None
    coste_laboratorio: float | None = None
    precio_paciente: float | None = None
    margen: float | None = None
    comision_doctor_pct: float | None = None
    estado_pago_laboratorio: str | None = None
    estado_cobro_paciente: str | None = None
    colocado: bool | None = None
    material_enviado: bool | None = None
    material_devuelto: bool | None = None



class TrabajoAsociarCita(BaseModel):
    cita_id: uuid.UUID | None = None



class TrabajoEstadoAccion(BaseModel):
    fecha: date | None = None
    ubicacion_clinica: str | None = Field(None, max_length=120)
    observaciones: str | None = Field(None, max_length=1000)



class PacienteMin(BaseModel):
    id: uuid.UUID
    nombre: str
    apellidos: str
    num_historial: int
    model_config = {"from_attributes": True}



class DoctorMin(BaseModel):
    id: uuid.UUID
    nombre: str
    model_config = {"from_attributes": True}



class TrabajoResponse(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    doctor_id: uuid.UUID
    laboratorio_id: uuid.UUID
    historial_id: uuid.UUID | None
    cita_id: uuid.UUID | None
    tratamiento_id: uuid.UUID | None
    presupuesto_id: uuid.UUID | None
    presupuesto_linea_id: uuid.UUID | None
    factura_id: uuid.UUID | None
    numero_orden: int | None
    referencia: str | None
    referencia_interna: str | None
    referencia_proveedor: str | None
    tipo_trabajo: str | None
    descripcion: str
    pieza_dental: int | None
    color: str | None
    observaciones: str | None
    fecha_salida: date | None
    fecha_entrega_prevista: date | None
    fecha_recepcion: date | None
    fecha_revision: date | None
    fecha_entrega_paciente: date | None
    ubicacion_clinica: str | None
    estado: str
    precio: float | None
    coste_laboratorio: float | None
    precio_paciente: float | None
    margen: float | None
    comision_doctor_pct: float | None
    estado_pago_laboratorio: str
    estado_cobro_paciente: str
    colocado: bool
    material_enviado: bool
    material_devuelto: bool
    paciente: PacienteMin | None = None
    doctor: DoctorMin | None = None
    laboratorio: LaboratorioResponse | None = None
    model_config = {"from_attributes": True}



class AgendaLaboratorioResumen(BaseModel):
    fecha: date
    total: int
    listos: int
    pendientes: int
    retrasados: int



class AgendaLaboratorioDiaResponse(BaseModel):
    fecha: date
    resumen: AgendaLaboratorioResumen
    trabajos: list[TrabajoResponse]
