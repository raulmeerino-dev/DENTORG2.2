export type UserRole = 'admin' | 'doctor' | 'recepcion' | 'auxiliar' | 'paciente';

export interface UsuarioMe {
  id: string;
  username: string;
  nombre: string;
  rol: UserRole;
  doctor_id: string | null;
  clinica_id?: string | null;
  two_factor_enabled?: boolean;
}

export type PacienteSexo = 'M' | 'F' | 'otro';

export interface ApiPaciente {
  id: string;
  codigo?: string | null;
  num_historial: number;
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  dni_nie?: string | null;
  telefono: string | null;
  telefono2?: string | null;
  email?: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  observaciones?: string | null;
  datos_salud?: Record<string, unknown> | null;
  activo: boolean;
  clinica_id?: string | null;
  entidad_id?: string | null;
  entidad_alt_id?: string | null;
  // Ficha ampliada (paridad Eurodent)
  sexo?: PacienteSexo | null;
  profesion?: string | null;
  pais?: string | null;
  doctor_habitual_id?: string | null;
  num_poliza?: string | null;
  pagador_distinto?: boolean;
  pagador_nombre?: string | null;
  pagador_dni?: string | null;
  pagador_direccion?: string | null;
  // Calculados desde historial clínico
  fecha_primera_visita?: string | null;
  fecha_ultima_visita?: string | null;
}

export interface PortalMe {
  paciente: ApiPaciente;
  resumen: {
    proximas_citas: number;
    documentos: number;
    consentimientos_pendientes: number;
  };
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
  clinica_id?: string | null;
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
  factura_id?: string;
  historial_id?: string | null;
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

export interface PagoAnticipadoPaciente {
  id: string;
  paciente_id: string;
  clinica_id?: string | null;
  fecha: string;
  importe: string;
  forma_pago_id: string;
  forma_pago?: FormaPago | null;
  usuario_id: string;
  concepto: string;
  notas: string | null;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
}

export interface FormaPago {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Factura {
  id: string;
  clinica_id?: string | null;
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
  tiene_receta_electronica?: boolean;
}

export interface SaldoPaciente {
  paciente_id: string;
  total_facturado: string;
  total_cobrado: string;
  pendiente: string;
  facturas_pendientes: number;
}

export interface Clinica {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono?: string | null;
  email?: string | null;
  cif?: string | null;
  activa: boolean;
}

export interface ProductoInventario {
  id: string;
  clinica_id: string | null;
  nombre: string;
  categoria: string | null;
  sku: string | null;
  stock_min: number;
  stock_act: number;
  unidad: string;
  coste_unitario: number | string;
  proveedor_id: string | null;
  activo: boolean;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  tipo: 'entrada' | 'salida' | 'ajuste' | 'consumo_factura';
  cantidad: number;
  stock_resultante: number;
  motivo: string | null;
  factura_id: string | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  usuario_id: string | null;
  created_at: string;
}

export interface ProveedorInventario {
  id: string;
  clinica_id: string | null;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
}

export interface PedidoLineaInventario {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  coste_unitario: number | string;
}

export interface PedidoProveedorInventario {
  id: string;
  proveedor_id: string;
  clinica_id: string | null;
  estado: 'borrador' | 'enviado' | 'recibido' | 'cancelado';
  fecha: string;
  notas: string | null;
  lineas: PedidoLineaInventario[];
  created_at: string;
}

export interface IngresosReporte {
  total: number;
  pac: number;
  seg: number;
}

export interface BackupRegistro {
  id: string;
  tipo: string;
  estado: string;
  ubicacion: string | null;
  hash_sha256: string | null;
  tamano_bytes: number | null;
  cifrado: boolean;
  error: string | null;
  created_by_id: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ProductionReadinessCheck {
  status: 'ok' | 'warn' | 'fail';
  area: string;
  titulo: string;
  detalle: string;
  accion_recomendada: string;
}

export interface ProductionReadinessReport {
  overall: 'ok' | 'warn' | 'fail';
  generated_at: string;
  totals: { ok: number; warn: number; fail: number };
  checks: ProductionReadinessCheck[];
  next_steps: string[];
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  user_id: string | null;
  clinica_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  event_hash: string | null;
}

export interface VideoConsultaResponse {
  citaId: string;
  videoUrl: string;
  estado: string;
}

export interface RecordatorioCitaResponse {
  citaId: string;
  canal: 'whatsapp' | 'email' | 'ambos';
  estado: string;
  whatsappUrl?: string | null;
  emailUrl?: string | null;
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

export interface HuecoLibre {
  doctor_id: string;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  duracion_min: number;
}

export interface DisponibilidadDia {
  doctor_id: string;
  fecha: string;
  bloques: Array<{ inicio: string; fin: string }>;
  intervalo_min: number;
  trabaja: boolean;
}

export interface CitaCambio {
  id: string;
  cita_id: string;
  usuario_id: string | null;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  fecha_anterior: string | null;
  fecha_nueva: string | null;
  doctor_anterior_id: string | null;
  doctor_nuevo_id: string | null;
  motivo: string | null;
  datos: Record<string, unknown> | null;
  created_at: string;
}

export interface TelefonearPendiente {
  id: string;
  cita_original_id: string;
  paciente_id: string;
  doctor_id: string;
  nueva_cita_id: string | null;
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
  origen?: string | null;
  presupuesto_linea_id?: string | null;
  cita_id?: string | null;
  tratamiento: TratamientoResumen | null;
  doctor: { id: string; nombre: string } | null;
}

export interface SesionTratamientoRealizadoInput {
  paciente_id: string;
  tratamiento_id: string;
  doctor_id?: string | null;
  gabinete_id?: string | null;
  cita_id?: string | null;
  presupuesto_linea_id?: string | null;
  pieza_dental?: number | null;
  caras?: string | null;
  fecha?: string | null;
  procedimiento?: string | null;
  observaciones?: string | null;
  origen: 'manual' | 'cita' | 'presupuesto_linea';
  importe?: string | number | null;
}

export interface HistorialSinFacturar {
  id: string;
  fecha: string;
  pieza_dental: number | null;
  caras: string | null;
  observaciones: string | null;
  tratamiento_id: string;
  tratamiento_nombre: string;
  tratamiento_precio: string;
  tratamiento_iva: string;
  doctor_id: string;
  doctor_nombre: string;
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
  id?: string | null;
  codigo: string;
  nombre: string;
  version: string;
  version_num?: number;
  tratamientos: string[];
  tipo_tratamiento?: string | null;
  contenido?: string | null;
}

export interface Consentimiento {
  id: string;
  paciente_id: string;
  clinica_id: string | null;
  plantilla_id: string | null;
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
  version_plantilla: number | null;
  contenido?: string | null;
  hash_documento: string | null;
  revocado: boolean;
  fecha_revocacion: string | null;
  motivo_revocacion: string | null;
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
  especialidad?: string | null;
  color_agenda: string | null;
  es_auxiliar?: boolean;
  porcentaje?: string | number | null;
  activo: boolean;
}

export interface RecetaClinica {
  id: string;
  paciente_id: string;
  doctor_id: string;
  clinica_id: string | null;
  medicamento: string;
  principio_activo: string | null;
  forma_farmaceutica: string | null;
  via_administracion: string | null;
  unidades: string | null;
  duracion: string | null;
  posologia: string;
  pauta: string | null;
  diagnostico: string | null;
  instrucciones_paciente: string | null;
  instrucciones_farmacia: string | null;
  fecha_prescripcion: string;
  fecha_dispensacion: string | null;
  firma_data_url: string | null;
  pdf_generado_at: string | null;
  created_at: string;
  doctor?: { id: string; nombre: string } | null;
}

export interface NotaDental {
  id: string;
  paciente_id: string;
  pieza_dental: number;
  caras: string | null;
  texto: string;
  fecha: string;
  doctor_id: string | null;
  cita_id: string | null;
  historial_id: string | null;
  doctor?: { id: string; nombre: string } | null;
}

export interface NotaDentalCreateInput {
  paciente_id: string;
  pieza_dental: number;
  caras?: string | null;
  texto: string;
  fecha?: string | null;
  doctor_id?: string | null;
  cita_id?: string | null;
  historial_id?: string | null;
}

export interface RecetaCreateInput {
  doctor_id: string;
  medicamento: string;
  posologia: string;
  principio_activo?: string | null;
  forma_farmaceutica?: string | null;
  via_administracion?: string | null;
  unidades?: string | null;
  duracion?: string | null;
  pauta?: string | null;
  diagnostico?: string | null;
  instrucciones_paciente?: string | null;
  instrucciones_farmacia?: string | null;
  fecha_prescripcion?: string | null;
  fecha_dispensacion?: string | null;
  firma_data_url?: string | null;
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
  presupuesto_linea_id?: string | null;
  factura_id?: string | null;
  numero_orden?: number | null;
  referencia?: string | null;
  referencia_interna?: string | null;
  referencia_proveedor?: string | null;
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
  colocado?: boolean;
  material_enviado?: boolean;
  material_devuelto?: boolean;
  paciente: { id: string; nombre: string; apellidos: string; num_historial: number } | null;
  doctor: { id: string; nombre: string } | null;
  laboratorio: Laboratorio | null;
}

export interface TrabajoLaboratorioCreateInput {
  paciente_id: string;
  doctor_id: string;
  laboratorio_id: string;
  descripcion: string;
  tipo_trabajo?: string | null;
  pieza_dental?: number | null;
  color?: string | null;
  observaciones?: string | null;
  fecha_entrega_prevista?: string | null;
  referencia_interna?: string | null;
  referencia_proveedor?: string | null;
  presupuesto_id?: string | null;
  presupuesto_linea_id?: string | null;
  tratamiento_id?: string | null;
  material_enviado?: boolean | null;
}

export interface TrabajoLaboratorioUpdateInput {
  estado?: string;
  fecha_recepcion?: string | null;
  fecha_entrega_paciente?: string | null;
  colocado?: boolean;
  material_enviado?: boolean;
  material_devuelto?: boolean;
  referencia_proveedor?: string | null;
  observaciones?: string | null;
}

export interface ReportKpis {
  citas: {
    total: number;
    por_estado: Record<string, number>;
    asistencia: number;
    faltas: number;
    anuladas?: number;
    no_show_rate?: number;
  };
  pacientes_nuevos: number;
  facturacion: {
    num_facturas: number;
    total_facturado: number;
    total_cobrado: number;
    pendiente: number;
    ticket_medio?: number;
  };
  tratamientos_realizados: number;
  presupuestos: {
    total: number;
    por_estado: Record<string, number>;
    aceptacion_rate?: number;
    rechazo_rate?: number;
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
  importe?: number;
}

export interface ReportCitasDoctor {
  doctor_id: string | null;
  doctor: string;
  color: string | null;
  total: number;
  atendidas: number;
  faltas: number;
  ocupacion_pct?: number;
}

export interface ReportIngresoMensual {
  mes: number;
  facturado: number;
  cobrado: number;
  num_facturas: number;
}

export interface ReportPacienteDeuda {
  id: string;
  num_historial: number;
  nombre: string;
  apellidos: string;
  saldo_pendiente: number;
}

export interface ReportDashboard {
  periodo: { desde: string; hasta: string };
  kpis: ReportKpis;
  series: { ingresos_mensuales: ReportIngresoMensual[] };
  doctores: ReportCitasDoctor[];
  tratamientos: ReportTopTratamiento[];
  pacientes_deuda: ReportPacienteDeuda[];
  alertas: {
    citas_sin_confirmar: number;
    pacientes_en_clinica: number;
    faltas_periodo: number;
    deuda_pendiente: number;
    presupuestos_pendientes: number;
  };
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

export type OdontogramaSurfaceName = 'oclusal_incisal' | 'mesial' | 'distal' | 'vestibular' | 'lingual_palatina' | 'raiz' | 'lingual_palatal';

export type OdontogramaStatus =
  | 'sano'
  | 'caries'
  | 'obturacion'
  | 'endodoncia'
  | 'corona'
  | 'implante'
  | 'ausente'
  | 'extraccion_indicada'
  | 'fractura'
  | 'movilidad'
  | 'protesis'
  | 'tratamiento_presupuestado'
  | 'tratamiento_aceptado'
  | 'tratamiento_pendiente'
  | 'tratamiento_realizado';

export interface OdontogramaSuperficie {
  id: string;
  pieza_id: string;
  superficie: OdontogramaSurfaceName;
  condicion: OdontogramaStatus | string;
  tratamiento_planificado_id: string | null;
  tratamiento_realizado_id: string | null;
  presupuesto_linea_id?: string | null;
  color_estado: string | null;
  notas: string | null;
}

export interface OdontogramaPieza {
  id: string;
  odontograma_id: string;
  pieza_fdi: number;
  estado_general: OdontogramaStatus | string;
  movilidad?: string | null;
  pronostico?: string | null;
  notas: string | null;
  superficies: OdontogramaSuperficie[];
}

export interface OdontogramaPaciente {
  id: string;
  paciente_id: string;
  clinica_id: string | null;
  version: number;
  activo: boolean;
  denticion?: string;
  created_at: string;
  updated_at: string | null;
  piezas: OdontogramaPieza[];
}

export interface OdontogramaEvento {
  id: string;
  odontograma_id: string;
  pieza_fdi: number | null;
  superficie: string | null;
  accion: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  usuario_id: string | null;
  created_at: string;
}

export type OdontogramaContextMode =
  | 'diagnostico'
  | 'presupuesto'
  | 'pendiente'
  | 'realizado'
  | 'historial'
  | 'documentos'
  | 'lectura';

export interface OdontogramaContextSurface {
  diagnostico?: string | null;
  context_state?: string | null;
  tratamiento_id?: string | null;
  presupuesto_linea_id?: string | null;
  historial_id?: string | null;
  factura_id?: string | null;
  label?: string | null;
  amount?: string | null;
  doctor?: string | null;
  fecha?: string | null;
  documentos?: Array<Record<string, unknown>>;
}

export interface OdontogramaContextTooth {
  base: {
    estado_general: string;
    movilidad?: string | null;
    pronostico?: string | null;
    notas?: string | null;
  };
  surfaces: Record<string, OdontogramaContextSurface>;
}

export interface OdontogramaContexto {
  mode: OdontogramaContextMode;
  odontograma_id: string;
  paciente_id: string;
  denticion: string;
  teeth: Record<string, OdontogramaContextTooth>;
}
