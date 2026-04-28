export type UserRole = 'admin' | 'doctor' | 'recepcion';

export interface UsuarioMe {
  id: string;
  username: string;
  nombre: string;
  rol: UserRole;
  doctor_id: string | null;
}

export interface ApiPaciente {
  id: string;
  codigo?: string | null;
  num_historial: number;
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  telefono2?: string | null;
  email?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  observaciones?: string | null;
  datos_salud?: Record<string, unknown> | null;
  activo: boolean;
}

export interface TratamientoResumen {
  id: string;
  nombre: string;
  codigo: string | null;
}

export interface FamiliaTratamiento {
  id: string;
  nombre: string;
  icono: string | null;
  orden: number;
}

export interface TratamientoCatalogo {
  id: string;
  familia_id: string;
  familia: FamiliaTratamiento | null;
  codigo: string | null;
  nombre: string;
  precio: string;
  iva_porcentaje: string;
  requiere_pieza: boolean;
  requiere_caras: boolean;
  activo: boolean;
}

export interface PresupuestoLinea {
  id: string;
  presupuesto_id: string;
  tratamiento_id: string;
  tratamiento: TratamientoResumen | null;
  pieza_dental: number | null;
  caras: string | null;
  precio_unitario: string;
  descuento_porcentaje: string;
  aceptado: boolean;
  pasado_trabajo_pendiente: boolean;
  importe_neto: string;
}

export interface Presupuesto {
  id: string;
  paciente_id: string;
  numero: number;
  fecha: string;
  estado: string;
  pie_pagina: string | null;
  odontograma: OdontogramaPlan;
  doctor_id: string;
  lineas: PresupuestoLinea[];
  total: string;
  total_aceptado: string;
}

export interface FacturaLinea {
  id: string;
  concepto: string;
  concepto_ficticio: string | null;
  cantidad: number;
  precio_unitario: string;
  iva_porcentaje: string;
  subtotal: string;
}

export interface Cobro {
  id: string;
  fecha: string;
  importe: string;
  forma_pago_id: string;
  notas: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
}

export interface FormaPago {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Factura {
  id: string;
  paciente_id: string;
  serie: string;
  numero: number;
  fecha: string;
  estado: string;
  subtotal: string;
  iva_total: string;
  total: string;
  huella: string | null;
  num_registro: number | null;
  estado_verifactu: string | null;
  lineas: FacturaLinea[];
  cobros: Cobro[];
  total_cobrado: string;
  pendiente: string;
}

export interface Cita {
  id: string;
  paciente_id: string;
  doctor_id: string;
  gabinete_id: string | null;
  fecha_hora: string;
  duracion_min: number;
  estado: string;
  es_urgencia?: boolean;
  motivo: string | null;
  observaciones?: string | null;
  recordatorio_enviado?: boolean;
  recordatorio_canal?: string | null;
  recordatorio_estado?: string | null;
  recordatorio_at?: string | null;
  confirmado_at?: string | null;
  motivo_cancelacion?: string | null;
  paciente?: { nombre: string; apellidos: string; telefono: string | null };
  doctor?: { nombre: string; color_agenda: string | null };
}

export interface TelefonearPendiente {
  id: string;
  paciente: { nombre: string; apellidos: string; telefono: string | null } | null;
  doctor: { nombre: string; color_agenda: string | null } | null;
  motivo: string | null;
  notas?: string | null;
  estado_contacto?: string;
  ultimo_intento_at?: string | null;
  proximo_intento_at?: string | null;
  reubicada: boolean;
}

export interface HistorialClinico {
  id: string;
  paciente_id: string;
  tratamiento_id: string;
  doctor_id: string;
  gabinete_id: string | null;
  pieza_dental: number | null;
  caras: string | null;
  fecha: string;
  diagnostico: string | null;
  procedimiento: string | null;
  observaciones: string | null;
  estado: string;
  importe: string | null;
  factura_id: string | null;
  tratamiento: TratamientoResumen | null;
  doctor: { id: string; nombre: string } | null;
}

export interface DocumentoPaciente {
  id: string;
  paciente_id: string;
  nombre_original: string;
  ruta?: string | null;
  mime_type: string;
  tamano_bytes: number;
  categoria: string;
  descripcion: string | null;
  fecha_documento: string | null;
  tratamiento_id: string | null;
  historial_id: string | null;
  doctor_id: string | null;
  etiquetas: string | null;
  created_at: string | null;
}

export interface PlantillaConsentimiento {
  codigo: string;
  nombre: string;
  version: string;
  tratamientos: string[];
}

export interface Consentimiento {
  id: string;
  paciente_id: string;
  tratamiento_id: string | null;
  doctor_id: string | null;
  historial_id: string | null;
  documento_id: string | null;
  tipo: string;
  estado: string;
  fecha_firma: string;
  firmado_at: string | null;
  documento_path: string | null;
  plantilla_version: string | null;
  contenido?: string | null;
  revocado: boolean;
  fecha_revocacion: string | null;
  created_at: string;
}

export interface HorarioDoctor {
  id: string;
  doctor_id: string;
  dia_semana: number;
  tipo_dia: string;
  bloques: Array<{ inicio: string; fin: string }>;
  intervalo_min: number;
}

export interface Doctor {
  id: string;
  nombre: string;
  color_agenda: string | null;
  activo: boolean;
}

export interface Laboratorio {
  id: string;
  nombre: string;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  contacto: string | null;
  notas: string | null;
  activo: boolean;
}

export interface TrabajoLaboratorio {
  id: string;
  paciente_id: string;
  doctor_id: string;
  laboratorio_id: string;
  historial_id: string | null;
  tratamiento_id?: string | null;
  presupuesto_id?: string | null;
  factura_id?: string | null;
  referencia?: string | null;
  tipo_trabajo?: string | null;
  descripcion: string;
  pieza_dental: number | null;
  color: string | null;
  observaciones: string | null;
  fecha_salida: string | null;
  fecha_entrega_prevista: string | null;
  fecha_recepcion: string | null;
  fecha_entrega_paciente: string | null;
  estado: string;
  precio: number | null;
  coste_laboratorio?: number | null;
  precio_paciente?: number | null;
  margen?: number | null;
  comision_doctor_pct?: number | null;
  estado_pago_laboratorio?: string;
  estado_cobro_paciente?: string;
  paciente: { id: string; nombre: string; apellidos: string; num_historial: number } | null;
  doctor: { id: string; nombre: string } | null;
  laboratorio: Laboratorio | null;
}

export interface ReportKpis {
  citas: {
    total: number;
    por_estado: Record<string, number>;
    asistencia: number;
    faltas: number;
  };
  pacientes_nuevos: number;
  facturacion: {
    num_facturas: number;
    total_facturado: number;
    total_cobrado: number;
    pendiente: number;
  };
  tratamientos_realizados: number;
  presupuestos: {
    total: number;
    por_estado: Record<string, number>;
  };
}

export interface ReportPaciente {
  id: string;
  num_historial: number;
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  activo: boolean;
  total_citas: number;
  saldo_pendiente: number;
}

export interface ReportTopTratamiento {
  tratamiento: string;
  cantidad: number;
}

export interface ReportCitasDoctor {
  doctor_id: string | null;
  doctor: string;
  color: string | null;
  total: number;
  atendidas: number;
  faltas: number;
}

export interface CumplimientoSif {
  modo: string;
  sif_codigo: string;
  sif_version: string;
  sif_nombre_producto: string;
  declaracion_responsable: string;
  resumen: {
    total_facturas: number;
    total_registros_facturacion: number;
    total_eventos_sif: number;
    facturas_pendientes_remision: number;
    facturas_rechazadas: number;
  };
  diagnostico_series: Array<{ ok: boolean; serie: string; total_registros: number; errores: unknown[] }>;
  ultimos_registros: Array<{
    id: string;
    factura_id: string;
    serie: string;
    numero_factura: number;
    tipo_registro: string;
    secuencia: number;
    estado_remision: string | null;
    huella: string;
    created_at: string;
  }>;
}

export interface OdontogramaPlan {
  version?: number;
  teeth?: Record<string, { estado: string; superficies: string[]; lineaId?: string }>;
}
