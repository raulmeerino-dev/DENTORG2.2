import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  ApiPaciente,
  BackupRegistro,
  Cita,
  Clinica,
  Consentimiento,
  CumplimientoSif,
  DocumentoPaciente,
  Doctor,
  FamiliaTratamiento,
  Factura,
  FormaPago,
  HistorialClinico,
  HorarioDoctor,
  HuecoLibre,
  Laboratorio,
  OdontogramaPlan,
  PlantillaConsentimiento,
  Presupuesto,
  PresupuestoLinea,
  ReportCitasDoctor,
  ReportKpis,
  ReportPaciente,
  ReportTopTratamiento,
  RecordatorioCitaResponse,
  IngresosReporte,
  MovimientoInventario,
  ProductoInventario,
  TelefonearPendiente,
  TrabajoLaboratorio,
  TratamientoCatalogo,
  UsuarioMe,
  VideoConsultaResponse,
} from '../types/api';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8011/api',
  withCredentials: true,
});

export const AUTH_TOKEN_KEY = 'dentorg_token';
const DEMO_TOKEN_PREFIX = 'demo:';

function addMinutesLocal(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function getStoredAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem(AUTH_TOKEN_KEY);
}

function setStoredAuthToken(token: string) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearStoredAuthToken() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

const DEMO_DOCTORES: Doctor[] = [
  { id: 'demo-doc-1', nombre: 'Dr. Garcia Ruiz', especialidad: 'Implantologia', color_agenda: '#2563eb', es_auxiliar: false, porcentaje: '35.00', activo: true },
  { id: 'demo-doc-2', nombre: 'Dra. Lopez Herrera', especialidad: 'Ortodoncia', color_agenda: '#16a34a', es_auxiliar: false, porcentaje: '40.00', activo: true },
  { id: 'demo-doc-3', nombre: 'Dr. Martin Torres', especialidad: 'Endodoncia', color_agenda: '#dc2626', es_auxiliar: false, porcentaje: '35.00', activo: true },
  { id: 'demo-doc-4', nombre: 'Dra. Sanchez Vega', especialidad: 'Higiene', color_agenda: '#9333ea', es_auxiliar: true, porcentaje: '0.00', activo: true },
];

const DEMO_PACIENTES: ApiPaciente[] = [
  {
    id: 'demo-pac-1',
    codigo: '#0091312',
    num_historial: 91312,
    nombre: 'CESAR',
    apellidos: 'GUTIERREZ VELEZ',
    fecha_nacimiento: '1969-09-13',
    telefono: '942503186',
    telefono2: '685140378',
    email: 'cesar@example.test',
    direccion: 'BARRIO PALACIO 139',
    ciudad: 'PONTEJOS',
    provincia: 'CANTABRIA',
    observaciones: 'LIMP cada 6 meses [14-10-13]',
    datos_salud: { alergias: 'Sin alergias registradas' },
    activo: true,
  },
  {
    id: 'demo-pac-2',
    codigo: '#003485',
    num_historial: 3485,
    nombre: 'PILAR',
    apellidos: 'OJEDA CALVO',
    fecha_nacimiento: '1974-04-02',
    telefono: '600000001',
    telefono2: null,
    email: '',
    direccion: 'AVENIDA CENTRAL 18',
    ciudad: 'SANTANDER',
    provincia: 'CANTABRIA',
    observaciones: 'Avisar para revision de implante.',
    datos_salud: { alergias: 'Penicilina' },
    activo: true,
  },
];

const DEMO_FAMILIAS: FamiliaTratamiento[] = [
  { id: 'fam-pf', nombre: 'Protesis fija', icono: 'PF', orden: 1 },
  { id: 'fam-impl', nombre: 'Implantologia', icono: 'IM', orden: 2 },
  { id: 'fam-cons', nombre: 'Conservadora', icono: 'OC', orden: 3 },
  { id: 'fam-endo', nombre: 'Endodoncia', icono: 'EN', orden: 4 },
  { id: 'fam-cx', nombre: 'Cirugia oral', icono: 'CX', orden: 5 },
  { id: 'fam-per', nombre: 'Periodoncia', icono: 'PE', orden: 6 },
  { id: 'fam-orto', nombre: 'Ortodoncia', icono: 'OR', orden: 7 },
  { id: 'fam-rem', nombre: 'Protesis removible', icono: 'PR', orden: 8 },
  { id: 'fam-est', nombre: 'Estetica dental', icono: 'ES', orden: 9 },
  { id: 'fam-otros', nombre: 'Otros', icono: 'OT', orden: 10 },
];

const DEMO_FAMILIA_BY_ID = Object.fromEntries(DEMO_FAMILIAS.map((familia) => [familia.id, familia])) as Record<string, FamiliaTratamiento>;

type DemoTreatmentRow = [string, string, string, string, string, boolean, boolean];

const DEMO_TREATMENT_ROWS: DemoTreatmentRow[] = [
  ['trt-pf001', 'fam-pf', 'PF001', 'Puente de 2 piezas de zirconio', '780.00', false, false],
  ['trt-pf002', 'fam-pf', 'PF002', 'Puente de 2 piezas metal-cerámica', '600.00', false, false],
  ['trt-pf003', 'fam-pf', 'PF003', 'Puente de 3 piezas de zirconio', '1170.00', false, false],
  ['trt-pf004', 'fam-pf', 'PF004', 'Puente de 3 piezas metal-cerámica', '900.00', false, false],
  ['trt-pf005', 'fam-pf', 'PF005', 'Puente de 4 piezas de zirconio', '1560.00', false, false],
  ['trt-pf006', 'fam-pf', 'PF006', 'Puente de 4 piezas metal-cerámica', '1200.00', false, false],
  ['trt-pf007', 'fam-pf', 'PF007', 'Puente de 5 piezas de zirconio', '1950.00', false, false],
  ['trt-pf008', 'fam-pf', 'PF008', 'Puente de 5 piezas metal-cerámica', '1500.00', false, false],
  ['trt-pf009', 'fam-pf', 'PF009', 'Puente de 6 piezas de zirconio', '2340.00', false, false],
  ['trt-im001', 'fam-impl', 'IM001', 'Puente fijo de 12 piezas sobre 6 implantes', '3400.00', false, false],
  ['trt-oc001', 'fam-cons', 'OC001', 'Abrasión para obturar', '40.00', true, true],
  ['trt-im002', 'fam-impl', 'IM002', 'Aditamento de teflón', '50.00', true, false],
  ['trt-im003', 'fam-impl', 'IM003', 'Aditamento externo', '100.00', true, false],
  ['trt-im004', 'fam-impl', 'IM004', 'Aditamento para implante integrado', '300.00', true, false],
  ['trt-en001', 'fam-endo', 'EN001', 'Apicectomía', '180.00', true, false],
  ['trt-pf010', 'fam-pf', 'PF010', 'Ataches', '240.00', false, false],
  ['trt-ot001', 'fam-otros', 'OT001', 'Atención domiciliaria', '200.00', false, false],
  ['t-blan', 'fam-est', 'ES001', 'Blanqueamiento externo', '300.00', false, false],
  ['trt-es002', 'fam-est', 'ES002', 'Blanqueamiento interno', '100.00', true, false],
  ['trt-or001', 'fam-orto', 'OR001', 'Brackets de zafiro', '850.00', false, false],
  ['trt-or002', 'fam-orto', 'OR002', 'Brackets metálicos', '650.00', false, false],
  ['trt-or003', 'fam-orto', 'OR003', 'Brackets transparentes', '700.00', false, false],
  ['trt-pf011', 'fam-pf', 'PF011', 'Carilla de zirconio', '420.00', true, false],
  ['trt-pf012', 'fam-pf', 'PF012', 'Cementado', '20.00', true, false],
  ['trt-cx001', 'fam-cx', 'CX001', 'Cirugía menor', '40.00', false, false],
  ['trt-ot002', 'fam-otros', 'OT002', 'Compostura', '60.00', false, false],
  ['trt-pf013', 'fam-pf', 'PF013', 'Corona metal-cerámica', '300.00', true, false],
  ['trt-im005', 'fam-impl', 'IM005', 'Corona sobre implante', '450.00', true, false],
  ['trt-pf014', 'fam-pf', 'PF014', 'Corona de zirconio', '390.00', true, false],
  ['trt-im006', 'fam-impl', 'IM006', 'Desatornillar prótesis y limpieza de implantes', '75.00', false, false],
  ['trt-oc002', 'fam-cons', 'OC002', 'Diferencia de reconstrucción', '20.00', true, false],
  ['trt-im007', 'fam-impl', 'IM007', 'Elevación con regeneración', '900.00', false, false],
  ['trt-im008', 'fam-impl', 'IM008', 'Elevación de seno', '500.00', false, false],
  ['t-emp', 'fam-cons', 'OC003', 'Empaste', '50.00', true, true],
  ['trt-en002', 'fam-endo', 'EN002', 'Endodoncia multirradicular', '180.00', true, false],
  ['t-endo', 'fam-endo', 'EN003', 'Endodoncia unirradicular', '150.00', true, false],
  ['trt-or004', 'fam-orto', 'OR004', 'Estudio de ortodoncia', '50.00', false, false],
  ['trt-cx002', 'fam-cx', 'CX002', 'Exodoncia compleja', '120.00', true, false],
  ['trt-cx003', 'fam-cx', 'CX003', 'Exodoncia de tercer molar', '100.00', true, false],
  ['trt-cx004', 'fam-cx', 'CX004', 'Exodoncia normal', '50.00', true, false],
  ['trt-or005', 'fam-orto', 'OR005', 'Férula de descarga Michigan', '250.00', false, false],
  ['trt-or006', 'fam-orto', 'OR006', 'Férula retenedora de alambre', '120.00', false, false],
  ['trt-or007', 'fam-orto', 'OR007', 'Férula retenedora de ortodoncia', '100.00', false, false],
  ['trt-cx005', 'fam-cx', 'CX005', 'Frenectomía', '180.00', false, false],
  ['trt-pe001', 'fam-per', 'PE001', 'Gingivectomía', '180.00', false, false],
  ['trt-oc004', 'fam-cons', 'OC004', 'Gran reconstrucción', '80.00', true, true],
  ['t-impl', 'fam-impl', 'IM009', 'Implante', '890.00', true, false],
  ['trt-pe002', 'fam-per', 'PE002', 'Injerto de tejido conectivo', '500.00', false, false],
  ['t-limp', 'fam-cons', 'OC005', 'Limpieza', '60.00', false, false],
  ['trt-or008', 'fam-orto', 'OR008', 'Mantenedor de espacio', '120.00', false, false],
  ['trt-im010', 'fam-impl', 'IM010', 'Mesoestructura completa', '4200.00', false, false],
  ['trt-en004', 'fam-endo', 'EN004', 'Perno de cuarzo', '100.00', true, false],
  ['trt-en005', 'fam-endo', 'EN005', 'Perno de titanio', '90.00', true, false],
  ['trt-es003', 'fam-est', 'ES003', 'Piercing', '40.00', false, false],
  ['trt-or009', 'fam-orto', 'OR009', 'Placa expansora', '500.00', false, false],
  ['trt-or010', 'fam-orto', 'OR010', 'Placa Hawley', '400.00', false, false],
  ['trt-pr001', 'fam-rem', 'PR001', 'Prótesis metal-esquelética', '800.00', false, false],
  ['trt-pr002', 'fam-rem', 'PR002', 'Prótesis de resina', '700.00', false, false],
  ['trt-pr003', 'fam-rem', 'PR003', 'Prótesis inmediata completa', '350.00', false, false],
  ['trt-pr004', 'fam-rem', 'PR004', 'Prótesis inmediata parcial', '250.00', false, false],
  ['trt-pe003', 'fam-per', 'PE003', 'Raspaje y alisado por cuadrante', '80.00', false, false],
  ['trt-pe004', 'fam-per', 'PE004', 'Raspaje y alisado por pieza', '20.00', true, false],
  ['trt-oc006', 'fam-cons', 'OC006', 'Reconstrucción endodoncia', '60.00', true, true],
  ['trt-oc007', 'fam-cons', 'OC007', 'Reconstrucción estética', '120.00', true, true],
  ['trt-im011', 'fam-impl', 'IM011', 'Regeneración ósea', '450.00', false, false],
  ['trt-cx006', 'fam-cx', 'CX006', 'Regularización ósea', '200.00', false, false],
  ['trt-en006', 'fam-endo', 'EN006', 'Rehacer endodoncia', '180.00', true, false],
  ['trt-oc008', 'fam-cons', 'OC008', 'Reponer empaste', '25.00', true, true],
  ['trt-or011', 'fam-orto', 'OR011', 'Revisión placa Hawley', '30.00', false, false],
  ['trt-or012', 'fam-orto', 'OR012', 'Revisión placa expansora', '50.00', false, false],
  ['trt-oc009', 'fam-cons', 'OC009', 'Sellador', '20.00', true, false],
  ['trt-im012', 'fam-impl', 'IM012', 'Sobredentadura', '900.00', false, false],
  ['trt-im013', 'fam-impl', 'IM013', 'Sobredentadura removible', '2340.00', false, false],
  ['t-orto', 'fam-orto', 'OR013', 'Tratamiento de ortodoncia de 12 meses', '1080.00', false, false],
  ['trt-or014', 'fam-orto', 'OR014', 'Tratamiento de ortodoncia de 18 meses', '1620.00', false, false],
  ['trt-or015', 'fam-orto', 'OR015', 'Tratamiento de ortodoncia de 24 meses', '2160.00', false, false],
  ['trt-or016', 'fam-orto', 'OR016', 'Tratamiento de ortodoncia con Smilers de 18 meses', '6300.00', false, false],
  ['trt-or017', 'fam-orto', 'OR017', 'Tratamiento de ortodoncia con Smilers de 12 meses', '4200.00', false, false],
  ['trt-or018', 'fam-orto', 'OR018', 'Tratamiento de ortodoncia con Smilers de 6 meses', '2100.00', false, false],
];

const DEMO_TRATAMIENTOS: TratamientoCatalogo[] = DEMO_TREATMENT_ROWS.map(
  ([id, familia_id, codigo, nombre, precio, requiere_pieza, requiere_caras]) => ({
    id,
    familia_id,
    familia: DEMO_FAMILIA_BY_ID[familia_id],
    codigo,
    nombre,
    precio,
    iva_porcentaje: '0.00',
    requiere_pieza,
    requiere_caras,
    activo: true,
  }),
);

const DEMO_TRATAMIENTO_BY_ID = Object.fromEntries(DEMO_TRATAMIENTOS.map((tratamiento) => [tratamiento.id, tratamiento])) as Record<string, TratamientoCatalogo>;

const DEMO_PRESUPUESTOS: Presupuesto[] = [
  {
    id: 'demo-pres-1',
    paciente_id: 'demo-pac-1',
    numero: 381,
    fecha: '2026-04-14',
    estado: 'aceptado',
    pie_pagina: null,
    odontograma: {
      version: 1,
      teeth: {
        16: { estado: 'planificado', superficies: ['O'], lineaId: 'demo-line-1' },
        24: { estado: 'planificado', superficies: ['M'], lineaId: 'demo-line-2' },
        37: { estado: 'realizado', superficies: ['O'], lineaId: 'demo-line-3' },
      },
    },
    doctor_id: 'demo-doc-1',
    lineas: [
      { id: 'demo-line-1', presupuesto_id: 'demo-pres-1', tratamiento_id: 't-limp', tratamiento: DEMO_TRATAMIENTO_BY_ID['t-limp'], pieza_dental: null, caras: null, precio_unitario: '60.00', descuento_porcentaje: '0.00', aceptado: true, pasado_trabajo_pendiente: true, importe_neto: '60.00' },
      { id: 'demo-line-2', presupuesto_id: 'demo-pres-1', tratamiento_id: 't-endo', tratamiento: DEMO_TRATAMIENTO_BY_ID['t-endo'], pieza_dental: 24, caras: null, precio_unitario: '150.00', descuento_porcentaje: '0.00', aceptado: true, pasado_trabajo_pendiente: false, importe_neto: '150.00' },
      { id: 'demo-line-3', presupuesto_id: 'demo-pres-1', tratamiento_id: 't-impl', tratamiento: DEMO_TRATAMIENTO_BY_ID['t-impl'], pieza_dental: 37, caras: null, precio_unitario: '890.00', descuento_porcentaje: '0.00', aceptado: false, pasado_trabajo_pendiente: false, importe_neto: '890.00' },
    ],
    total: '1100.00',
    total_aceptado: '210.00',
  },
];

const DEMO_FACTURAS: Factura[] = [
  {
    id: 'demo-fac-1',
    paciente_id: 'demo-pac-1',
    serie: 'A',
    numero: 381,
    fecha: '2026-04-14',
    estado: 'emitida',
    subtotal: '210.00',
    iva_total: '0.00',
    total: '210.00',
    huella: 'demo-huella-fiscal-123456',
    num_registro: 1,
    estado_verifactu: 'pendiente',
    lineas: [{ id: 'demo-fl-1', concepto: 'Limpieza y endodoncia unirradicular', concepto_ficticio: '24', cantidad: 1, precio_unitario: '210.00', iva_porcentaje: '0.00', subtotal: '210.00' }],
    cobros: [{ id: 'demo-cob-1', fecha: '2026-04-14T10:00:00', importe: '150.00', forma_pago_id: 'demo-fp-1', notas: null, anulado_at: null, motivo_anulacion: null }],
    total_cobrado: '150.00',
    pendiente: '60.00',
  },
];

const DEMO_HISTORIAL: HistorialClinico[] = [
  {
    id: 'demo-hist-1',
    paciente_id: 'demo-pac-1',
    tratamiento_id: 't-limp',
    doctor_id: 'demo-doc-1',
    gabinete_id: 'gab-2',
    pieza_dental: null,
    caras: null,
    fecha: '2026-04-14',
    diagnostico: 'Revision periodica',
    procedimiento: 'Limpieza, profilaxis y topicacion',
    observaciones: 'Paciente citado para control en 6 meses.',
    estado: 'realizado',
    importe: '60.00',
    factura_id: 'demo-fac-1',
    tratamiento: { id: 't-limp', nombre: DEMO_TRATAMIENTO_BY_ID['t-limp'].nombre, codigo: DEMO_TRATAMIENTO_BY_ID['t-limp'].codigo },
    doctor: { id: 'demo-doc-1', nombre: DEMO_DOCTORES[0].nombre },
  },
  {
    id: 'demo-hist-2',
    paciente_id: 'demo-pac-2',
    tratamiento_id: 't-endo',
    doctor_id: 'demo-doc-2',
    gabinete_id: 'gab-1',
    pieza_dental: 24,
    caras: null,
    fecha: '2026-02-09',
    diagnostico: 'Dolor a percusion',
    procedimiento: 'Endodoncia unirradicular',
    observaciones: 'Control radiografico en la proxima visita.',
    estado: 'cobrado_parcial',
    importe: '150.00',
    factura_id: null,
    tratamiento: { id: 't-endo', nombre: DEMO_TRATAMIENTO_BY_ID['t-endo'].nombre, codigo: DEMO_TRATAMIENTO_BY_ID['t-endo'].codigo },
    doctor: { id: 'demo-doc-2', nombre: DEMO_DOCTORES[1].nombre },
  },
];

const DEMO_DOCUMENTOS: DocumentoPaciente[] = [
  {
    id: 'demo-docpac-1',
    paciente_id: 'demo-pac-1',
    nombre_original: 'rx_periapical_24.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 182400,
    categoria: 'radiografia',
    descripcion: 'Radiografia periapical previa a endodoncia',
    fecha_documento: '2026-04-14',
    tratamiento_id: 't-endo',
    historial_id: 'demo-hist-1',
    doctor_id: 'demo-doc-1',
    etiquetas: 'endo, pieza 24',
    created_at: '2026-04-14T10:30:00',
  },
  {
    id: 'demo-docpac-2',
    paciente_id: 'demo-pac-1',
    nombre_original: 'presupuesto_implantes.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 94600,
    categoria: 'presupuesto',
    descripcion: 'Presupuesto entregado al paciente',
    fecha_documento: '2026-04-14',
    tratamiento_id: 't-impl',
    historial_id: null,
    doctor_id: 'demo-doc-1',
    etiquetas: 'implantes',
    created_at: '2026-04-14T11:05:00',
  },
];

const DEMO_PLANTILLAS_CONSENTIMIENTO: PlantillaConsentimiento[] = [
  { codigo: 'implantes', nombre: 'Implantes', version: '2026.04', tratamientos: ['implante', 'cirugia'] },
  { codigo: 'extracciones', nombre: 'Extracciones', version: '2026.04', tratamientos: ['extraccion', 'cirugia'] },
  { codigo: 'endodoncia', nombre: 'Endodoncia', version: '2026.04', tratamientos: ['endodoncia'] },
  { codigo: 'ortodoncia', nombre: 'Ortodoncia', version: '2026.04', tratamientos: ['ortodoncia'] },
  { codigo: 'blanqueamiento', nombre: 'Blanqueamiento', version: '2026.04', tratamientos: ['blanqueamiento'] },
  { codigo: 'periodoncia', nombre: 'Periodoncia', version: '2026.04', tratamientos: ['periodoncia'] },
  { codigo: 'protesis', nombre: 'Protesis', version: '2026.04', tratamientos: ['protesis'] },
  { codigo: 'limpieza', nombre: 'Limpieza / profilaxis', version: '2026.04', tratamientos: ['limpieza'] },
];

const DEMO_CONSENTIMIENTOS: Consentimiento[] = [
  {
    id: 'demo-cons-1',
    paciente_id: 'demo-pac-1',
    tratamiento_id: 't-endo',
    doctor_id: 'demo-doc-1',
    historial_id: 'demo-hist-1',
    documento_id: 'demo-docpac-1',
    tipo: 'Endodoncia',
    estado: 'firmado',
    fecha_firma: '2026-04-14',
    firmado_at: '2026-04-14T10:45:00',
    documento_path: 'pacientes/demo-pac-1/consentimiento_endodoncia.pdf',
    plantilla_version: '2026.04',
    revocado: false,
    fecha_revocacion: null,
    created_at: '2026-04-14T10:40:00',
  },
];

const DEMO_FORMAS_PAGO: FormaPago[] = [
  { id: 'demo-fp-1', nombre: 'Efectivo', activo: true },
  { id: 'demo-fp-2', nombre: 'Tarjeta', activo: true },
  { id: 'demo-fp-3', nombre: 'Transferencia', activo: true },
];

api.interceptors.request.use((config) => {
  const token = getStoredAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function login(username: string, password: string, otp?: string) {
  try {
    const { data } = await api.post<{ access_token: string }>('/auth/login', { username, password, otp });
    setStoredAuthToken(data.access_token);
    return data.access_token;
  } catch (error) {
    const demo = demoLogin(username, password, error);
    if (!demo) throw error;
    setStoredAuthToken(demo);
    return demo;
  }
}

export async function logout() {
  await api.post('/auth/logout').catch(() => undefined);
  clearStoredAuthToken();
}

export async function getMe() {
  const demoUser = getDemoUser();
  if (demoUser) return demoUser;
  const { data } = await api.get<UsuarioMe>('/auth/me');
  return data;
}

export async function getPacientes() {
  return withDemoFallback(api.get<ApiPaciente[]>('/pacientes'), DEMO_PACIENTES);
}

export async function getClinicas() {
  return withDemoFallback(api.get<Clinica[]>('/clinicas'), [
    { id: 'demo-clinica-1', nombre: 'Clínica Norte', direccion: 'Av. Ejemplo 123', telefono: null, email: null, cif: null, activa: true },
  ]);
}

export async function createClinica(data: Partial<Clinica> & { nombre: string }) {
  return withDemoFallback(api.post<Clinica>('/clinicas', data), {
    id: `demo-clinica-${Date.now()}`,
    nombre: data.nombre,
    direccion: data.direccion ?? null,
    telefono: data.telefono ?? null,
    email: data.email ?? null,
    cif: data.cif ?? null,
    activa: true,
  });
}

export async function getPaciente(pacienteId: string) {
  return withDemoFallback(api.get<ApiPaciente>(`/pacientes/${pacienteId}`), DEMO_PACIENTES.find((item) => item.id === pacienteId) ?? DEMO_PACIENTES[0]);
}

export async function createPaciente(data: Partial<ApiPaciente> & { nombre: string; apellidos: string }) {
  const fallback: ApiPaciente = {
    id: `demo-pac-${Date.now()}`,
    codigo: null,
    num_historial: Math.floor(Date.now() / 1000),
    nombre: data.nombre,
    apellidos: data.apellidos,
    fecha_nacimiento: data.fecha_nacimiento ?? null,
    dni_nie: data.dni_nie ?? null,
    telefono: data.telefono ?? null,
    telefono2: data.telefono2 ?? null,
    email: data.email ?? null,
    direccion: data.direccion ?? null,
    codigo_postal: data.codigo_postal ?? null,
    ciudad: data.ciudad ?? null,
    provincia: data.provincia ?? null,
    observaciones: data.observaciones ?? null,
    datos_salud: data.datos_salud ?? null,
    activo: true,
  };
  return withDemoFallback(api.post<ApiPaciente>('/pacientes', data), fallback);
}

export async function updatePaciente(pacienteId: string, data: Partial<ApiPaciente>) {
  const fallback = DEMO_PACIENTES.find((item) => item.id === pacienteId);
  return withDemoFallback(api.patch<ApiPaciente>(`/pacientes/${pacienteId}`, data), {
    ...(fallback ?? DEMO_PACIENTES[0]),
    ...data,
    id: pacienteId,
  } as ApiPaciente);
}

export async function getPresupuestos(pacienteId: string) {
  return withDemoFallback(
    api.get<Presupuesto[]>('/presupuestos', { params: { paciente_id: pacienteId } }),
    DEMO_PRESUPUESTOS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')),
  );
}

export async function getFacturas(pacienteId?: string) {
  return withDemoFallback(
    api.get<Factura[]>('/facturas', { params: pacienteId ? { paciente_id: pacienteId } : {} }),
    pacienteId ? DEMO_FACTURAS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')) : DEMO_FACTURAS,
  );
}

export async function getHistorialPaciente(pacienteId: string) {
  return withDemoFallback(
    api.get<HistorialClinico[]>(`/tratamientos/historial/${pacienteId}`),
    DEMO_HISTORIAL.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')),
  );
}

export async function getDocumentosPaciente(pacienteId: string, categoria?: string) {
  const docs = DEMO_DOCUMENTOS.filter((item) => {
    if (!(item.paciente_id === pacienteId || pacienteId.startsWith('demo-'))) return false;
    return !categoria || item.categoria === categoria;
  });
  return withDemoFallback(api.get<DocumentoPaciente[]>(`/pacientes/${pacienteId}/documentos`, { params: categoria ? { categoria } : {} }), docs);
}

export function documentoDownloadUrl(pacienteId: string, documentoId: string) {
  return `${api.defaults.baseURL}/pacientes/${pacienteId}/documentos/${documentoId}/descargar`;
}

export async function openDocumentoPaciente(pacienteId: string, documentoId: string, filename = 'documento.pdf') {
  const { data } = await api.get<Blob>(`/pacientes/${pacienteId}/documentos/${documentoId}/descargar`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const opened = window.open(url, '_blank');
  if (!opened) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function uploadDocumentoPaciente(pacienteId: string, data: {
  archivo: File;
  categoria: string;
  descripcion?: string;
  fecha_documento?: string;
  tratamiento_id?: string | null;
  historial_id?: string | null;
  doctor_id?: string | null;
  etiquetas?: string;
}) {
  const form = new FormData();
  form.append('archivo', data.archivo);
  form.append('categoria', data.categoria);
  if (data.descripcion) form.append('descripcion', data.descripcion);
  if (data.fecha_documento) form.append('fecha_documento', data.fecha_documento);
  if (data.tratamiento_id) form.append('tratamiento_id', data.tratamiento_id);
  if (data.historial_id) form.append('historial_id', data.historial_id);
  if (data.doctor_id) form.append('doctor_id', data.doctor_id);
  if (data.etiquetas) form.append('etiquetas', data.etiquetas);
  const fallback: DocumentoPaciente = {
    id: `demo-doc-${Date.now()}`,
    paciente_id: pacienteId,
    nombre_original: data.archivo.name,
    ruta: null,
    mime_type: data.archivo.type || 'application/octet-stream',
    tamano_bytes: data.archivo.size,
    categoria: data.categoria,
    descripcion: data.descripcion ?? null,
    fecha_documento: data.fecha_documento ?? new Date().toISOString().slice(0, 10),
    tratamiento_id: data.tratamiento_id ?? null,
    historial_id: data.historial_id ?? null,
    doctor_id: data.doctor_id ?? null,
    etiquetas: data.etiquetas ?? null,
    created_at: new Date().toISOString(),
  };
  return withDemoFallback(api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos`, form), fallback);
}

export async function generarDocumentoPdfPaciente(pacienteId: string, data: {
  titulo: string;
  categoria: string;
  contenido: string;
  descripcion?: string;
  etiquetas?: string;
  fecha_documento?: string;
  tratamiento_id?: string | null;
  historial_id?: string | null;
  doctor_id?: string | null;
  firma_data_url?: string | null;
}) {
  const fallback: DocumentoPaciente = {
    id: `demo-pdf-${Date.now()}`,
    paciente_id: pacienteId,
    nombre_original: `${data.titulo.replace(/\s+/g, '_').toLowerCase()}.pdf`,
    ruta: null,
    mime_type: 'application/pdf',
    tamano_bytes: data.contenido.length,
    categoria: data.categoria,
    descripcion: data.descripcion ?? data.titulo,
    fecha_documento: data.fecha_documento ?? new Date().toISOString().slice(0, 10),
    tratamiento_id: data.tratamiento_id ?? null,
    historial_id: data.historial_id ?? null,
    doctor_id: data.doctor_id ?? null,
    etiquetas: data.etiquetas ?? null,
    created_at: new Date().toISOString(),
  };
  return withDemoFallback(api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos/generar-pdf`, data), fallback);
}

export async function getPlantillasConsentimiento() {
  return withDemoFallback(api.get<PlantillaConsentimiento[]>('/consentimientos/plantillas'), DEMO_PLANTILLAS_CONSENTIMIENTO);
}

export async function getConsentimientosPaciente(pacienteId: string) {
  return withDemoFallback(
    api.get<Consentimiento[]>(`/pacientes/${pacienteId}/consentimientos`),
    DEMO_CONSENTIMIENTOS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')),
  );
}

export async function createConsentimientoPaciente(pacienteId: string, tipo: string, doctorId?: string | null, extra?: Partial<{
  tratamiento_id: string | null;
  historial_id: string | null;
  documento_id: string | null;
  estado: string;
  fecha_firma: string;
  documento_path: string | null;
  plantilla_version: string | null;
  contenido: string | null;
}>) {
  const now = new Date().toISOString();
  return withDemoFallback(api.post<Consentimiento>(`/pacientes/${pacienteId}/consentimientos`, {
    tipo,
    doctor_id: doctorId,
    estado: extra?.estado ?? 'pendiente_firma',
    plantilla_version: extra?.plantilla_version ?? '2026.04',
    ...extra,
  }), {
    id: `demo-cons-${Date.now()}`,
    paciente_id: pacienteId,
    tratamiento_id: null,
    doctor_id: doctorId ?? null,
    historial_id: null,
    documento_id: null,
    tipo,
    estado: extra?.estado ?? 'pendiente_firma',
    fecha_firma: now.slice(0, 10),
    firmado_at: extra?.estado === 'firmado' ? now : null,
    documento_path: extra?.documento_path ?? null,
    plantilla_version: extra?.plantilla_version ?? '2026.04',
    contenido: extra?.contenido ?? null,
    revocado: false,
    fecha_revocacion: null,
    created_at: now,
  });
}

export async function getFormasPago() {
  return withDemoFallback(api.get<FormaPago[]>('/facturas/formas-pago'), DEMO_FORMAS_PAGO);
}

export async function createPresupuesto(pacienteId: string, doctorId: string) {
  return withDemoFallback(api.post<Presupuesto>('/presupuestos', {
    paciente_id: pacienteId,
    doctor_id: doctorId,
    fecha: new Date().toISOString().slice(0, 10),
    lineas: [],
  }), { ...DEMO_PRESUPUESTOS[0], id: `demo-pres-${Date.now()}`, paciente_id: pacienteId, doctor_id: doctorId });
}

export async function addPresupuestoLinea(presupuestoId: string, data: {
  tratamiento_id: string;
  pieza_dental?: number | null;
  caras?: string | null;
  precio_unitario: string | number;
  descuento_porcentaje?: string | number;
}) {
  const tratamiento = DEMO_TRATAMIENTOS.find((item) => item.id === data.tratamiento_id) ?? null;
  return withDemoFallback(api.post<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas`, {
    tratamiento_id: data.tratamiento_id,
    pieza_dental: data.pieza_dental ?? null,
    caras: data.caras || null,
    precio_unitario: Number(data.precio_unitario),
    descuento_porcentaje: Number(data.descuento_porcentaje ?? 0),
  }), {
    id: `demo-line-${Date.now()}`,
    presupuesto_id: presupuestoId,
    tratamiento_id: data.tratamiento_id,
    tratamiento,
    pieza_dental: data.pieza_dental ?? null,
    caras: data.caras || null,
    precio_unitario: String(data.precio_unitario),
    descuento_porcentaje: String(data.descuento_porcentaje ?? 0),
    aceptado: false,
    pasado_trabajo_pendiente: false,
    importe_neto: String(Number(data.precio_unitario) * (1 - Number(data.descuento_porcentaje ?? 0) / 100)),
  });
}

export async function updatePresupuestoLinea(presupuestoId: string, lineaId: string, data: Partial<{
  pieza_dental: number | null;
  caras: string | null;
  precio_unitario: string | number;
  descuento_porcentaje: string | number;
  aceptado: boolean;
}>) {
  return withDemoFallback(api.patch<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`, data), {
    ...DEMO_PRESUPUESTOS[0].lineas[0],
    id: lineaId,
    presupuesto_id: presupuestoId,
    pieza_dental: data.pieza_dental ?? null,
    caras: data.caras ?? null,
    precio_unitario: String(data.precio_unitario ?? DEMO_PRESUPUESTOS[0].lineas[0].precio_unitario),
    descuento_porcentaje: String(data.descuento_porcentaje ?? DEMO_PRESUPUESTOS[0].lineas[0].descuento_porcentaje),
    aceptado: data.aceptado ?? false,
  });
}

export async function deletePresupuestoLinea(presupuestoId: string, lineaId: string) {
  return withDemoFallback(api.delete<void>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`), undefined);
}

export async function pasarPresupuestoTrabajoPendiente(presupuestoId: string) {
  return withDemoFallback(api.post<unknown[]>(`/presupuestos/${presupuestoId}/pasar-trabajo-pendiente`), []);
}

export async function createFacturaManual(pacienteId: string, concepto: string, importe: number) {
  return withDemoFallback(api.post<Factura>('/facturas', {
    paciente_id: pacienteId,
    serie: 'A',
    fecha: new Date().toISOString().slice(0, 10),
    tipo: 'paciente',
    lineas: [{
      concepto,
      cantidad: 1,
      precio_unitario: importe,
      iva_porcentaje: 0,
    }],
  }), {
    ...DEMO_FACTURAS[0],
    id: `demo-fac-${Date.now()}`,
    paciente_id: pacienteId,
    lineas: [{ ...DEMO_FACTURAS[0].lineas[0], concepto, precio_unitario: String(importe), subtotal: String(importe) }],
    subtotal: String(importe),
    total: String(importe),
    pendiente: String(importe),
    total_cobrado: '0.00',
  });
}

export async function registrarCobro(facturaId: string, formaPagoId: string, importe: number) {
  return withDemoFallback(api.post<Factura>(`/facturas/${facturaId}/cobros`, {
    forma_pago_id: formaPagoId,
    importe,
  }), { ...DEMO_FACTURAS[0], id: facturaId, total_cobrado: String(importe), pendiente: '0.00' });
}

export async function getCitas(params: Record<string, string>) {
  const day = params.fecha_desde?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const demoCitas: Cita[] = [
    { id: 'demo-cita-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', gabinete_id: 'gab-1', fecha_hora: `${day}T15:00:00`, duracion_min: 30, estado: 'confirmada', motivo: 'Revision', observaciones: 'Confirmada por WhatsApp', recordatorio_enviado: true, recordatorio_canal: 'whatsapp', recordatorio_estado: 'confirmado', recordatorio_at: `${day}T09:15:00`, confirmado_at: `${day}T09:18:00`, motivo_cancelacion: null, paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda } },
    { id: 'demo-cita-2', paciente_id: 'demo-pac-2', doctor_id: 'demo-doc-2', gabinete_id: 'gab-2', fecha_hora: `${day}T16:10:00`, duracion_min: 40, estado: 'programada', motivo: 'Ortodoncia', observaciones: 'Pendiente de confirmar', recordatorio_enviado: true, recordatorio_canal: 'whatsapp_email', recordatorio_estado: 'sin_respuesta', recordatorio_at: `${day}T08:30:00`, confirmado_at: null, motivo_cancelacion: null, paciente: { nombre: 'PILAR', apellidos: 'OJEDA CALVO', telefono: '600000001' }, doctor: { nombre: DEMO_DOCTORES[1].nombre, color_agenda: DEMO_DOCTORES[1].color_agenda } },
  ];
  const filtered = demoCitas.filter((item) => {
    if (params.paciente_id && item.paciente_id !== params.paciente_id && !params.paciente_id.startsWith('demo-')) return false;
    if (params.doctor_id && item.doctor_id !== params.doctor_id) return false;
    return true;
  });
  return withDemoFallback(api.get<Cita[]>('/citas', { params }), filtered);
}

export async function getPacienteCitas(pacienteId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const fallback = await getCitas({ paciente_id: pacienteId, fecha_desde: day });
  return withDemoFallback(api.get<Cita[]>(`/pacientes/${pacienteId}/citas`), fallback);
}

export async function iniciarVideoConsulta(citaId: string) {
  return withDemoFallback(api.post<VideoConsultaResponse>(`/citas/${citaId}/video`), {
    citaId,
    videoUrl: `https://meet.jit.si/dentorg2-demo-${citaId}`,
    estado: 'iniciada',
  });
}

export async function enviarRecordatorioCita(citaId: string, canal: 'whatsapp' | 'email' | 'ambos', mensaje?: string) {
  return withDemoFallback(api.post<RecordatorioCitaResponse>(`/citas/${citaId}/recordatorio`, { canal, mensaje }), {
    citaId,
    canal,
    estado: 'enviado',
    whatsappUrl: canal !== 'email' ? `https://wa.me/?text=${encodeURIComponent(mensaje ?? 'Recordatorio de cita dental')}` : null,
    emailUrl: canal !== 'whatsapp' ? `mailto:?subject=${encodeURIComponent('Recordatorio de cita dental')}&body=${encodeURIComponent(mensaje ?? '')}` : null,
  });
}

export async function buscarHuecosLibres(params: {
  doctor_id: string;
  duracion_min: number;
  desde: string;
  hasta: string;
  solo_manana?: boolean;
  solo_tarde?: boolean;
  max_resultados?: number;
}) {
  const day = params.desde.slice(0, 10);
  const fallbackSlots = params.solo_tarde
    ? ['15:00', '15:30', '16:00', '16:30', '17:00', '18:00']
    : params.solo_manana
      ? ['09:00', '09:30', '10:00', '10:30', '11:30', '12:00']
      : ['09:00', '09:30', '10:00', '11:00', '15:00', '16:00'];
  return withDemoFallback(api.get<HuecoLibre[]>('/citas/buscar-hueco', { params }), fallbackSlots.slice(0, params.max_resultados ?? 20).map((slot) => ({
    doctor_id: params.doctor_id,
    fecha_hora_inicio: `${day}T${slot}:00`,
    fecha_hora_fin: `${day}T${addMinutesLocal(slot, params.duracion_min)}:00`,
    duracion_min: params.duracion_min,
  })));
}

export async function createCita(data: {
  paciente_id: string;
  doctor_id: string;
  gabinete_id?: string | null;
  fecha_hora: string;
  duracion_min: number;
  motivo?: string | null;
  observaciones?: string | null;
  recordatorio_enviado?: boolean;
  recordatorio_canal?: string | null;
  recordatorio_estado?: string | null;
  motivo_cancelacion?: string | null;
}) {
  const paciente = DEMO_PACIENTES.find((item) => item.id === data.paciente_id) ?? DEMO_PACIENTES[0];
  const doctor = DEMO_DOCTORES.find((item) => item.id === data.doctor_id) ?? DEMO_DOCTORES[0];
  return withDemoFallback(api.post<Cita>('/citas', data), {
    id: `demo-cita-${Date.now()}`,
    paciente_id: data.paciente_id,
    doctor_id: data.doctor_id,
    gabinete_id: data.gabinete_id ?? null,
    fecha_hora: data.fecha_hora,
    duracion_min: data.duracion_min,
    estado: 'programada',
    es_urgencia: false,
    motivo: data.motivo ?? null,
    observaciones: data.observaciones ?? null,
    recordatorio_enviado: Boolean(data.recordatorio_enviado),
    recordatorio_canal: data.recordatorio_canal ?? null,
    recordatorio_estado: data.recordatorio_estado ?? null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: data.motivo_cancelacion ?? null,
    paciente: { nombre: paciente.nombre, apellidos: paciente.apellidos, telefono: paciente.telefono },
    doctor: { nombre: doctor.nombre, color_agenda: doctor.color_agenda },
  });
}

export async function updateCita(citaId: string, data: Partial<{
  doctor_id: string;
  gabinete_id: string | null;
  fecha_hora: string;
  duracion_min: number;
  estado: string;
  motivo: string | null;
  observaciones: string | null;
  recordatorio_enviado: boolean;
  recordatorio_canal: string | null;
  recordatorio_estado: string | null;
  motivo_cancelacion: string | null;
}>) {
  const doctor = data.doctor_id ? DEMO_DOCTORES.find((item) => item.id === data.doctor_id) : DEMO_DOCTORES[0];
  return withDemoFallback(api.patch<Cita>(`/citas/${citaId}`, data), {
    id: citaId,
    paciente_id: DEMO_PACIENTES[0].id,
    doctor_id: data.doctor_id ?? DEMO_DOCTORES[0].id,
    gabinete_id: data.gabinete_id ?? null,
    fecha_hora: data.fecha_hora ?? new Date().toISOString(),
    duracion_min: data.duracion_min ?? 30,
    estado: data.estado ?? 'programada',
    es_urgencia: false,
    motivo: data.motivo ?? 'Revision',
    observaciones: data.observaciones ?? null,
    recordatorio_enviado: data.recordatorio_enviado ?? false,
    recordatorio_canal: data.recordatorio_canal ?? null,
    recordatorio_estado: data.recordatorio_estado ?? null,
    recordatorio_at: null,
    confirmado_at: data.estado === 'confirmada' ? new Date().toISOString() : null,
    motivo_cancelacion: data.motivo_cancelacion ?? null,
    paciente: { nombre: DEMO_PACIENTES[0].nombre, apellidos: DEMO_PACIENTES[0].apellidos, telefono: DEMO_PACIENTES[0].telefono },
    doctor: { nombre: doctor?.nombre ?? DEMO_DOCTORES[0].nombre, color_agenda: doctor?.color_agenda ?? DEMO_DOCTORES[0].color_agenda },
  });
}

export async function getTelefonear() {
  return withDemoFallback(api.get<TelefonearPendiente[]>('/citas/panel/telefonear/pendientes'), [
    { id: 'demo-tel-1', paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda }, motivo: 'Confirmar cita', notas: 'Prefiere tarde', estado_contacto: 'pendiente', ultimo_intento_at: null, proximo_intento_at: new Date().toISOString(), reubicada: false },
    { id: 'demo-tel-2', paciente: { nombre: 'PILAR', apellidos: 'OJEDA CALVO', telefono: '600000001' }, doctor: { nombre: DEMO_DOCTORES[1].nombre, color_agenda: DEMO_DOCTORES[1].color_agenda }, motivo: 'Buscar hueco', notas: 'No responde a primera hora', estado_contacto: 'no_responde', ultimo_intento_at: new Date().toISOString(), proximo_intento_at: null, reubicada: false },
  ]);
}

export async function getDoctores() {
  return withDemoFallback(api.get<Doctor[]>('/doctores'), DEMO_DOCTORES);
}

export async function createDoctor(data: {
  nombre: string;
  especialidad?: string | null;
  color_agenda?: string | null;
  es_auxiliar?: boolean;
  porcentaje?: string | number | null;
}) {
  return withDemoFallback(api.post<Doctor>('/doctores', data), {
    id: `demo-doc-${Date.now()}`,
    nombre: data.nombre,
    especialidad: data.especialidad ?? null,
    color_agenda: data.color_agenda ?? '#2563eb',
    es_auxiliar: Boolean(data.es_auxiliar),
    porcentaje: data.porcentaje ?? null,
    activo: true,
  });
}

export async function updateDoctor(doctorId: string, data: Partial<{
  nombre: string;
  especialidad: string | null;
  color_agenda: string | null;
  es_auxiliar: boolean;
  porcentaje: string | number | null;
  activo: boolean;
}>) {
  const fallback = DEMO_DOCTORES.find((doctor) => doctor.id === doctorId) ?? DEMO_DOCTORES[0];
  return withDemoFallback(api.patch<Doctor>(`/doctores/${doctorId}`, data), {
    ...fallback,
    ...data,
    id: doctorId,
  });
}

export async function getHorarios(doctorId: string) {
  return withDemoFallback(api.get<HorarioDoctor[]>(`/doctores/${doctorId}/horarios`), [0, 1, 2, 3, 4].map((dia) => ({
    id: `demo-hor-${doctorId}-${dia}`,
    doctor_id: doctorId,
    dia_semana: dia,
    tipo_dia: 'laborable',
    bloques: [{ inicio: '09:00', fin: '13:30' }, { inicio: '15:00', fin: '20:30' }],
    intervalo_min: 10,
  })));
}

export async function updateHorarioDoctor(doctorId: string, diaSemana: number, data: {
  tipo_dia: string;
  bloques: Array<{ inicio: string; fin: string }>;
  intervalo_min: number;
}) {
  return withDemoFallback(api.put<HorarioDoctor>(`/doctores/${doctorId}/horarios/${diaSemana}`, data), {
    id: `demo-hor-${doctorId}-${diaSemana}`,
    doctor_id: doctorId,
    dia_semana: diaSemana,
    tipo_dia: data.tipo_dia,
    bloques: data.bloques,
    intervalo_min: data.intervalo_min,
  });
}

export async function getFamiliasTratamiento() {
  return withDemoFallback(api.get<FamiliaTratamiento[]>('/tratamientos/familias'), DEMO_FAMILIAS);
}

export async function createFamiliaTratamiento(data: { nombre: string; icono?: string | null; orden?: number }) {
  return withDemoFallback(api.post<FamiliaTratamiento>('/tratamientos/familias', {
    nombre: data.nombre,
    icono: data.icono ?? null,
    orden: data.orden ?? 0,
  }), {
    id: `demo-fam-${Date.now()}`,
    nombre: data.nombre,
    icono: data.icono ?? null,
    orden: data.orden ?? 0,
  });
}

export async function getTratamientosCatalogo(params: { q?: string; familia_id?: string; solo_activos?: boolean } = {}) {
  const q = params.q?.trim().toLowerCase();
  const filtered = DEMO_TRATAMIENTOS.filter((item) => {
    if (params.familia_id && item.familia_id !== params.familia_id) return false;
    if (q && !`${item.codigo} ${item.nombre} ${item.familia?.nombre}`.toLowerCase().includes(q)) return false;
    return params.solo_activos === false || item.activo;
  });
  return withDemoFallback(api.get<TratamientoCatalogo[]>('/tratamientos', { params }), filtered);
}

export async function createTratamientoCatalogo(data: {
  familia_id: string;
  codigo?: string | null;
  nombre: string;
  precio: string | number;
  iva_porcentaje?: string | number;
  requiere_pieza?: boolean;
  requiere_caras?: boolean;
}) {
  const familia = DEMO_FAMILIAS.find((item) => item.id === data.familia_id) ?? DEMO_FAMILIAS[0];
  return withDemoFallback(api.post<TratamientoCatalogo>('/tratamientos', {
    ...data,
    iva_porcentaje: data.iva_porcentaje ?? 0,
    requiere_pieza: Boolean(data.requiere_pieza),
    requiere_caras: Boolean(data.requiere_caras),
  }), {
    id: `demo-trat-${Date.now()}`,
    familia_id: data.familia_id,
    familia,
    codigo: data.codigo ?? null,
    nombre: data.nombre,
    precio: String(data.precio),
    iva_porcentaje: String(data.iva_porcentaje ?? 0),
    requiere_pieza: Boolean(data.requiere_pieza),
    requiere_caras: Boolean(data.requiere_caras),
    activo: true,
  });
}

export async function updateTratamientoCatalogo(id: string, data: Partial<{
  familia_id: string;
  codigo: string | null;
  nombre: string;
  precio: string | number;
  iva_porcentaje: string | number;
  requiere_pieza: boolean;
  requiere_caras: boolean;
  activo: boolean;
}>) {
  const familia = (data.familia_id ? DEMO_FAMILIAS.find((item) => item.id === data.familia_id) : DEMO_FAMILIAS[0]) ?? DEMO_FAMILIAS[0];
  return withDemoFallback(api.patch<TratamientoCatalogo>(`/tratamientos/${id}`, data), {
    id,
    familia_id: data.familia_id ?? familia.id,
    familia,
    codigo: data.codigo ?? null,
    nombre: data.nombre ?? 'Tratamiento',
    precio: String(data.precio ?? 0),
    iva_porcentaje: String(data.iva_porcentaje ?? 0),
    requiere_pieza: Boolean(data.requiere_pieza),
    requiere_caras: Boolean(data.requiere_caras),
    activo: data.activo ?? true,
  });
}

export async function deactivateTratamientoCatalogo(id: string) {
  return withDemoFallback(api.delete<TratamientoCatalogo>(`/tratamientos/${id}`), {
    ...DEMO_TRATAMIENTO_BY_ID['t-limp'],
    id,
    activo: false,
  });
}

export async function getInventario() {
  return withDemoFallback(api.get<ProductoInventario[]>('/inventario'), [
    { id: 'demo-prod-1', nombre: 'Amoxicilina', stock_min: 10, stock_act: 50, proveedor_id: null, activo: true },
    { id: 'demo-prod-2', nombre: 'Guantes nitrilo M', stock_min: 20, stock_act: 8, proveedor_id: null, activo: true },
  ]);
}

export async function createProductoInventario(data: { nombre: string; stock_min: number; stock_act: number }) {
  return withDemoFallback(api.post<ProductoInventario>('/inventario', data), {
    id: `demo-prod-${Date.now()}`,
    nombre: data.nombre,
    stock_min: data.stock_min,
    stock_act: data.stock_act,
    proveedor_id: null,
    activo: true,
  });
}

export async function updateProductoInventario(id: string, data: Partial<ProductoInventario>) {
  return withDemoFallback(api.patch<ProductoInventario>(`/inventario/${id}`, data), {
    id,
    nombre: data.nombre ?? 'Producto',
    stock_min: data.stock_min ?? 0,
    stock_act: data.stock_act ?? 0,
    proveedor_id: data.proveedor_id ?? null,
    activo: data.activo ?? true,
  });
}

export async function getMovimientosInventario(productoId: string) {
  return withDemoFallback(api.get<MovimientoInventario[]>(`/inventario/${productoId}/movimientos`), []);
}

export async function registrarMovimientoInventario(productoId: string, data: {
  tipo: MovimientoInventario['tipo'];
  cantidad: number;
  motivo?: string | null;
  factura_id?: string | null;
}) {
  return withDemoFallback(api.post<ProductoInventario>(`/inventario/${productoId}/movimientos`, data), {
    id: productoId,
    nombre: 'Producto',
    stock_min: 0,
    stock_act: data.tipo === 'entrada' || data.tipo === 'ajuste' ? data.cantidad : 0,
    proveedor_id: null,
    activo: true,
  });
}

export async function getIngresosReporte(desde: string, hasta: string) {
  return withDemoFallback(api.get<IngresosReporte>('/reportes/ingresos', { params: { desde, hasta } }), {
    total: 12345,
    pac: 6789,
    seg: 4556,
  });
}

export async function getBackups() {
  return withDemoFallback(api.get<BackupRegistro[]>('/admin/backups'), []);
}

export async function crearBackup() {
  const { data } = await api.post<BackupRegistro>('/admin/backups');
  return data;
}

export async function verificarBackup(backupId: string) {
  const { data } = await api.get<{ ok: boolean; motivo?: string; hash_actual?: string; tamano_bytes?: number; tablas?: number; created_at?: string }>(`/admin/backups/${backupId}/verificar`);
  return data;
}

export function recetaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/facturas/${facturaId}/receta`;
}

export async function emitirRecetaPdf(facturaId: string) {
  const { data } = await api.post<Blob>(`/facturas/${facturaId}/receta`, undefined, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const opened = window.open(url, '_blank');
  if (!opened) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `receta-${facturaId}.pdf`;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function enableTwoFactor() {
  const { data } = await api.post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/auth/2fa-enable');
  return data;
}

export async function syncOffline(payload: { pacientes: unknown[]; citas: unknown[] }) {
  const { data } = await api.post<{ pacientes: Record<string, string>; citas: Record<string, string>; pendientes: number }>('/sync', payload);
  return data;
}

export async function importPacientes(payload: Array<Record<string, string>>) {
  const { data } = await api.post<{ creados: number; errores: Array<Record<string, unknown>> }>('/import/pacientes', payload);
  return data;
}

export async function getLaboratorios(params: { solo_activos?: boolean } = {}) {
  const labs: Laboratorio[] = [
    { id: 'demo-lab-1', nombre: 'Laboratorio Norte', telefono: '942000001', whatsapp: '600100100', email: 'lab@example.test', contacto: 'Laura', notas: 'Zirconio y removible', activo: true },
    { id: 'demo-lab-2', nombre: 'Protesicos Centro', telefono: '942000002', whatsapp: null, email: '', contacto: 'Manuel', notas: 'Urgencias 48h', activo: true },
  ];
  return withDemoFallback(api.get<Laboratorio[]>('/laboratorios', { params }), labs);
}

export async function getTrabajosLaboratorio(params: { pendientes?: boolean; estado?: string; paciente_id?: string } = {}) {
  const trabajos: TrabajoLaboratorio[] = [
    { id: 'demo-labtrab-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', laboratorio_id: 'demo-lab-1', historial_id: null, tratamiento_id: 't-impl', presupuesto_id: 'demo-pres-1', factura_id: null, referencia: 'LAB-24-ZIR', tipo_trabajo: 'Corona', descripcion: 'Corona zirconio 24', pieza_dental: 24, color: 'A2', observaciones: 'Probar estructura', fecha_salida: '2026-04-20', fecha_entrega_prevista: '2026-04-28', fecha_recepcion: null, fecha_entrega_paciente: null, estado: 'enviado', precio: 120, coste_laboratorio: 120, precio_paciente: 290, margen: 170, comision_doctor_pct: 0, estado_pago_laboratorio: 'pendiente', estado_cobro_paciente: 'pendiente', paciente: { id: 'demo-pac-1', nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', num_historial: 91312 }, doctor: { id: 'demo-doc-1', nombre: DEMO_DOCTORES[0].nombre }, laboratorio: { id: 'demo-lab-1', nombre: 'Laboratorio Norte', telefono: '942000001', whatsapp: '600100100', email: 'lab@example.test', contacto: 'Laura', notas: null, activo: true } },
  ];
  const filtered = trabajos.filter((item) => {
    if (params.paciente_id && item.paciente_id !== params.paciente_id && !params.paciente_id.startsWith('demo-')) return false;
    if (params.estado && item.estado !== params.estado) return false;
    if (params.pendientes && !['pendiente', 'pendiente_enviar', 'enviado', 'en_proceso', 'en_fabricacion'].includes(item.estado)) return false;
    return true;
  });
  return withDemoFallback(api.get<TrabajoLaboratorio[]>('/laboratorio/trabajos', { params }), filtered);
}

export async function getReportKpis() {
  return withDemoFallback(api.get<ReportKpis>('/reportes/kpis'), {
    citas: { total: 18, por_estado: { confirmada: 12, atendida: 4, falta: 2 }, asistencia: 4, faltas: 2 },
    pacientes_nuevos: 5,
    facturacion: { num_facturas: 7, total_facturado: 4260, total_cobrado: 3110, pendiente: 1150 },
    tratamientos_realizados: 22,
    presupuestos: { total: 9, por_estado: { borrador: 2, aceptado: 5, rechazado: 2 } },
  });
}

export async function getReportPacientes() {
  return withDemoFallback(api.get<ReportPaciente[]>('/reportes/pacientes'), DEMO_PACIENTES.map((paciente, index) => ({
    id: paciente.id,
    num_historial: paciente.num_historial,
    nombre: paciente.nombre,
    apellidos: paciente.apellidos,
    fecha_nacimiento: paciente.fecha_nacimiento,
    activo: paciente.activo,
    total_citas: index === 0 ? 14 : 7,
    saldo_pendiente: index === 0 ? 145 : 0,
  })));
}

export async function getReportTopTratamientos() {
  return withDemoFallback(api.get<ReportTopTratamiento[]>('/reportes/top-tratamientos'), DEMO_TRATAMIENTOS.slice(0, 5).map((item, index) => ({
    tratamiento: item.nombre,
    cantidad: 12 - index,
  })));
}

export async function getReportCitasDoctor() {
  return withDemoFallback(api.get<ReportCitasDoctor[]>('/reportes/citas-por-doctor'), DEMO_DOCTORES.map((doctor, index) => ({
    doctor_id: doctor.id,
    doctor: doctor.nombre,
    color: doctor.color_agenda,
    total: 12 - index,
    atendidas: 8 - index,
    faltas: index,
  })));
}

export async function getCumplimientoSif() {
  const { data } = await api.get<CumplimientoSif>('/admin/cumplimiento-sif');
  return data;
}

export async function saveOdontograma(presupuestoId: string, odontograma: OdontogramaPlan) {
  return withDemoFallback(api.put<{ presupuesto_id: string; odontograma: OdontogramaPlan }>(
    `/presupuestos/${presupuestoId}/odontograma`,
    { odontograma },
  ), { presupuesto_id: presupuestoId, odontograma });
}

export function facturaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/pdf/facturas/${facturaId}`;
}

function shouldUseDemo(error?: unknown) {
  const axiosError = error as AxiosError | undefined;
  return import.meta.env.DEV && Boolean(axiosError?.isAxiosError && !axiosError.response);
}

function demoLogin(username: string, password: string, error?: unknown) {
  const axiosError = error as AxiosError | undefined;
  const backendRejectedInDev = import.meta.env.DEV && Boolean(axiosError?.isAxiosError && axiosError.response && [401, 403, 404].includes(axiosError.response.status));
  if (!shouldUseDemo(error) && !backendRejectedInDev) return null;
  const users: Record<string, { password: string; role: UsuarioMe['rol']; nombre: string; doctor_id: string | null }> = {
    admin: { password: 'admin1234', role: 'admin', nombre: 'Administrador', doctor_id: null },
    doctor: { password: 'doctor123', role: 'doctor', nombre: 'Dr. Garcia Ruiz', doctor_id: 'demo-doc-1' },
    recepcion: { password: 'recep123', role: 'recepcion', nombre: 'Recepcion', doctor_id: null },
  };
  const user = users[username];
  if (!user || user.password !== password) return null;
  return `${DEMO_TOKEN_PREFIX}${username}`;
}

function getDemoUser(): UsuarioMe | null {
  const token = getStoredAuthToken();
  if (!token?.startsWith(DEMO_TOKEN_PREFIX)) return null;
  const username = token.slice(DEMO_TOKEN_PREFIX.length);
  const users: Record<string, UsuarioMe> = {
    admin: { id: 'demo-user-admin', username: 'admin', nombre: 'Administrador', rol: 'admin', doctor_id: null },
    doctor: { id: 'demo-user-doctor', username: 'doctor', nombre: 'Dr. Garcia Ruiz', rol: 'doctor', doctor_id: 'demo-doc-1' },
    recepcion: { id: 'demo-user-recepcion', username: 'recepcion', nombre: 'Recepcion', rol: 'recepcion', doctor_id: null },
  };
  return users[username] ?? null;
}

function isDemoSession() {
  return Boolean(getStoredAuthToken()?.startsWith(DEMO_TOKEN_PREFIX));
}

function demoResponse<T>(data: T) {
  return Promise.resolve(data);
}

function withDemoFallback<T>(request: Promise<{ data: T }>, fallback: T) {
  if (isDemoSession()) return demoResponse(fallback);
  return request.then(({ data }) => data).catch((error) => {
    if (shouldUseDemo(error)) return fallback;
    throw error;
  });
}
