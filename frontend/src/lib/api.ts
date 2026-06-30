import axios from 'axios';
import type { AxiosError } from 'axios';
import type {
  ApiPaciente,
  AuditLogEntry,
  BackupRegistro,
  Cita,
  CitaCambio,
  Clinica,
  Consentimiento,
  CumplimientoSif,
  DocumentoPaciente,
  DictadoGuardarNotaInput,
  DictadoNotaGuardadaResponse,
  DictadoTranscripcionResponse,
  DoctorNotification,
  DisponibilidadDia,
  Doctor,
  FichajeRegistroResponse,
  FichajeTrabajador,
  FamiliaTratamiento,
  Factura,
  FormaPago,
  HistorialClinico,
  HistorialSinFacturar,
  HorarioDoctor,
  HuecoLibre,
  Laboratorio,
  OdontogramaContextMode,
  OdontogramaContexto,
  OdontogramaEvento,
  OdontogramaPaciente,
  OdontogramaPieza,
  OdontogramaPlan,
  OdontogramaStatus,
  OdontogramaSuperficie,
  OdontogramaSurfaceName,
  PagoAnticipadoPaciente,
  PlantillaConsentimiento,
  ProductionReadinessReport,
  Presupuesto,
  PresupuestoLinea,
  RecetaClinica,
  RecetaCreateInput,
  RecetaEmitirInput,
  RecetaPlantilla,
  RecetaProviderStatus,
  RecetaUpdateInput,
  SesionClinicaItem,
  SesionClinicaItemCreateInput,
  SesionClinicaItemUpdateInput,
  SesionTratamientoRealizadoInput,
  TrabajoLaboratorioCreateInput,
  ReportCitasDoctor,
  ReportDashboard,
  ReportKpis,
  ReportPaciente,
  ReportTopTratamiento,
  RecordatorioCitaResponse,
  SaldoPaciente,
  IngresosReporte,
  MovimientoInventario,
  NotaDental,
  NotaDentalCreateInput,
  PedidoProveedorInventario,
  PortalMe,
  PortalPublicCita,
  PortalPublicConsentimiento,
  PortalPublicDocumento,
  PortalPublicMe,
  ProductoInventario,
  ProveedorInventario,
  TelefonearPendiente,
  TrabajoLaboratorio,
  TratamientoCatalogo,
  TipoFichaje,
  TrabajadorFichaje,
  UsuarioMe,
  WhatsAppInboxItem,
} from '../types/api';
import {
  DEMO_CONSENTIMIENTOS,
  DEMO_DOCTORES,
  DEMO_DOCUMENTOS,
  DEMO_FACTURAS,
  DEMO_FAMILIAS,
  DEMO_FORMAS_PAGO,
  DEMO_HISTORIAL,
  DEMO_PACIENTES,
  DEMO_PLANTILLAS_CONSENTIMIENTO,
  DEMO_PRESUPUESTOS,
  DEMO_TRATAMIENTOS,
} from './demoData';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8011/api';
const API_LOG_PREFIX = '[DentCore API]';

function normalizeApiBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL;
export const API_BASE_URL = normalizeApiBaseUrl(configuredApiBaseUrl ?? DEFAULT_API_BASE_URL);
export const API_HEALTH_URL = `${API_BASE_URL}/health`;

if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
  console.info(`${API_LOG_PREFIX} base URL usada`, { baseURL: API_BASE_URL });
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export async function getAssistantLLMHealth() {
  const { data } = await api.get<{
    mode: string;
    activeProvider: 'ollama' | 'openai' | 'mock' | 'none';
    ollama: {
      available: boolean;
      model: string;
      message: string;
    };
    openai: {
      available: boolean;
      model: string;
      message: string;
    };
  }>('/assistant/llm-health');
  return data;
}

export const AUTH_TOKEN_KEY = 'dentcore_token';
const DEMO_TOKEN_PREFIX = 'demo:';
const DEMO_FALLBACK_ENABLED = import.meta.env.VITE_DEMO_FALLBACK === 'true';
let inMemoryAuthToken: string | null = null;

if (import.meta.env.PROD && DEMO_FALLBACK_ENABLED) {
  throw new Error('VITE_DEMO_FALLBACK=true no esta permitido en produccion: DentCore debe usar API real.');
}

function addMinutesLocal(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function getStoredAuthToken() {
  return inMemoryAuthToken;
}

function setStoredAuthToken(token: string) {
  inMemoryAuthToken = token;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearStoredAuthToken() {
  inMemoryAuthToken = null;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

type BackendHealthPayload = {
  ok?: boolean;
  service?: string;
  timestamp?: string;
};

let backendHealthPromise: Promise<boolean> | null = null;
let lastBackendHealthOk: boolean | null = null;

export async function checkBackendHealth({ force = false, timeoutMs = 2500 } = {}) {
  if (!force && lastBackendHealthOk === true) return true;
  if (backendHealthPromise) return backendHealthPromise;

  backendHealthPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API_HEALTH_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const contentType = response.headers?.get?.('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? ((await response.json().catch(() => null)) as BackendHealthPayload | null)
        : null;
      const ok = response.ok && payload?.ok === true;
      lastBackendHealthOk = ok;
      if (!ok) {
        console.warn(`${API_LOG_PREFIX} healthcheck fallido`, {
          healthURL: API_HEALTH_URL,
          status: response.status,
          payload,
        });
      }
      return ok;
    } catch (error) {
      lastBackendHealthOk = false;
      console.warn(`${API_LOG_PREFIX} fallo de conexion`, {
        baseURL: API_BASE_URL,
        healthURL: API_HEALTH_URL,
        error,
      });
      return false;
    } finally {
      clearTimeout(timeoutId);
      backendHealthPromise = null;
    }
  })();

  return backendHealthPromise;
}

api.interceptors.request.use((config) => {
  const token = getStoredAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function logEndpointFailure(error: AxiosError) {
  const endpoint = error.config?.url ?? 'endpoint desconocido';
  const method = error.config?.method?.toUpperCase() ?? 'GET';
  console.warn(`${API_LOG_PREFIX} endpoint fallido`, {
    method,
    endpoint,
    baseURL: API_BASE_URL,
    status: error.response?.status,
    code: error.code,
  });
}

async function describeAxiosError(error: AxiosError): Promise<string> {
  if (!error.response) {
    const code = error.code ?? 'NETWORK';
    const endpoint = error.config?.url ?? 'endpoint desconocido';
    const backendConnected = await checkBackendHealth({ force: true });
    if (!backendConnected) {
      return `Backend no conectado (${code}). Verifica que el backend este ejecutandose en ${API_BASE_URL}.`;
    }
    return `No se pudo completar la peticion (${code}) en ${endpoint}. Backend conectado; revisa el endpoint que fallo.`;
  }
  const { status, data } = error.response;
  if (data instanceof Blob) {
    const blobDetail = await readBlobErrorDetail(data);
    if (blobDetail) return blobDetail;
  }
  const detail = (data as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const loc = Array.isArray(first.loc) ? first.loc.filter((part) => part !== 'body').join('.') : '';
      return loc ? `${loc}: ${first.msg}` : first.msg;
    }
  }
  if (status === 401) return 'Sesion expirada o no autorizada. Vuelve a iniciar sesion.';
  if (status === 403) return 'No tienes permisos para esta accion.';
  if (status === 404) return 'Recurso no encontrado en el servidor.';
  if (status >= 500) return `Error en el servidor (${status}). Revisa los logs del backend.`;
  return `Error ${status} en la peticion.`;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const axiosError = error as AxiosError;
    if (axiosError?.isAxiosError) {
      logEndpointFailure(axiosError);
      axiosError.message = await describeAxiosError(axiosError);
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback = 'Error inesperado.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

async function readBlobErrorDetail(data: Blob): Promise<string | null> {
  if (!data.size) return null;
  const text = await data.text();
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    if (Array.isArray(parsed.detail) && parsed.detail.length) {
      const first = parsed.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  } catch {
    // Not a JSON error payload.
  }
  return text.slice(0, 200);
}

async function ensurePdfBlob(blob: Blob) {
  if (blob.size < 5) throw new Error('El PDF generado esta vacio.');
  const header = await blob.slice(0, 5).text();
  if (header !== '%PDF-') throw new Error('El servidor no devolvio un PDF valido.');
  if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
    throw new Error('El servidor devolvio un tipo de archivo inesperado para el PDF.');
  }
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function openOrDownloadBlob(
  blob: Blob,
  filename: string,
  options: { requirePdf?: boolean } = {},
) {
  if (!blob.size) throw new Error('El archivo descargado esta vacio.');
  if (options.requirePdf) await ensurePdfBlob(blob);
  const url = URL.createObjectURL(blob);
  let opened: Window | null = null;
  try {
    try {
      opened = window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      opened = null;
    }
    if (!opened) triggerDownload(url, filename);
    return { opened: Boolean(opened), downloaded: !opened };
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

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

export async function refreshAuthToken() {
  const { data } = await api.post<{ access_token: string }>('/auth/refresh');
  setStoredAuthToken(data.access_token);
  return data.access_token;
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

export async function getPacientes(params: {
  q?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  const normalizedQuery = params.q?.trim() ?? '';
  const fallback = DEMO_PACIENTES.filter((paciente) => {
    if (params.solo_activos === true && paciente.activo === false) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      paciente.num_historial,
      paciente.codigo,
      paciente.nombre,
      paciente.apellidos,
      paciente.telefono,
      paciente.telefono2,
      paciente.dni_nie,
      paciente.email,
    ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return normalizedQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  }).slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? DEMO_PACIENTES.length));
  return withDemoFallback(api.get<ApiPaciente[]>('/pacientes', { params }), fallback);
}

export async function getClinicas() {
  return withDemoFallback(api.get<Clinica[]>('/clinicas'), [
    { id: 'demo-clinica-1', nombre: 'Clínica Norte', direccion: 'Av. Ejemplo 123', telefono: null, email: null, cif: null, activa: true },
  ]);
}

export async function createClinica(data: Partial<Clinica> & { nombre: string }) {
  const { data: created } = await api.post<Clinica>('/clinicas', data);
  return created;
}

export async function getPaciente(pacienteId: string) {
  return withDemoFallback(api.get<ApiPaciente>(`/pacientes/${pacienteId}`), DEMO_PACIENTES.find((item) => item.id === pacienteId) ?? DEMO_PACIENTES[0]);
}

export async function createPaciente(data: Partial<ApiPaciente> & { nombre: string; apellidos: string }) {
  const { data: created } = await api.post<ApiPaciente>('/pacientes', data);
  return created;
}

export async function updatePaciente(pacienteId: string, data: Partial<ApiPaciente>) {
  const { data: updated } = await api.patch<ApiPaciente>(`/pacientes/${pacienteId}`, data);
  return updated;
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

export async function getSaldoPaciente(pacienteId: string) {
  const facturas = DEMO_FACTURAS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-'));
  const totalFacturado = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const totalCobrado = facturas.reduce((sum, factura) => sum + Number(factura.total_cobrado ?? 0), 0);
  return withDemoFallback(api.get<SaldoPaciente>(`/pacientes/${pacienteId}/saldo`), {
    paciente_id: pacienteId,
    total_facturado: totalFacturado.toFixed(2),
    total_cobrado: totalCobrado.toFixed(2),
    pendiente: (totalFacturado - totalCobrado).toFixed(2),
    facturas_pendientes: facturas.filter((factura) => Number(factura.pendiente) > 0).length,
  });
}

export async function getPagosAnticipadosPaciente(pacienteId: string) {
  return withDemoFallback(api.get<PagoAnticipadoPaciente[]>(`/pacientes/${pacienteId}/pagos-anticipados`), []);
}

export async function createPagoAnticipadoPaciente(pacienteId: string, data: {
  importe: number;
  forma_pago_id: string;
  concepto?: string;
  notas?: string | null;
}) {
  const { data: created } = await api.post<PagoAnticipadoPaciente>(`/pacientes/${pacienteId}/pagos-anticipados`, data);
  return created;
}

export async function updatePagoAnticipadoPaciente(pacienteId: string, pagoId: string, data: Partial<{
  importe: number;
  forma_pago_id: string;
  concepto: string;
  notas: string | null;
}>) {
  const { data: updated } = await api.patch<PagoAnticipadoPaciente>(`/pacientes/${pacienteId}/pagos-anticipados/${pagoId}`, data);
  return updated;
}

export async function getHistorialPaciente(pacienteId: string) {
  return withDemoFallback(
    api.get<HistorialClinico[]>(`/tratamientos/historial/${pacienteId}`),
    DEMO_HISTORIAL.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')),
  );
}

export async function getHistorialSinFacturar(pacienteId: string) {
  const fallback = DEMO_HISTORIAL
    .filter((item) => (item.paciente_id === pacienteId || pacienteId.startsWith('demo-')) && !item.factura_id)
    .map<HistorialSinFacturar>((item) => ({
      id: item.id,
      fecha: item.fecha,
      pieza_dental: item.pieza_dental,
      caras: item.caras,
      observaciones: item.observaciones,
      tratamiento_id: item.tratamiento_id,
      tratamiento_nombre: item.tratamiento?.nombre ?? item.procedimiento ?? 'Tratamiento dental',
      tratamiento_precio: item.importe ?? '0',
      tratamiento_iva: '0',
      doctor_id: item.doctor_id,
      doctor_nombre: item.doctor?.nombre ?? 'Doctor',
    }));
  return withDemoFallback(api.get<HistorialSinFacturar[]>('/facturas/historial-sin-facturar', { params: { paciente_id: pacienteId } }), fallback);
}

export async function finalizarTratamientoSesion(data: SesionTratamientoRealizadoInput) {
  const { data: saved } = await api.post<HistorialClinico>('/tratamientos/historial/sesion-realizada', data);
  return saved;
}

export async function getSesionItemsPaciente(pacienteId: string, options: { incluirRealizados?: boolean } = {}) {
  const { data } = await api.get<SesionClinicaItem[]>(`/tratamientos/pacientes/${pacienteId}/sesion-items`, {
    params: options.incluirRealizados ? { incluir_realizados: true } : undefined,
  });
  return data;
}

export async function createSesionItem(pacienteId: string, payload: SesionClinicaItemCreateInput) {
  const { data } = await api.post<SesionClinicaItem>(
    `/tratamientos/pacientes/${pacienteId}/sesion-items`,
    payload,
  );
  return data;
}

export async function updateSesionItem(pacienteId: string, itemId: string, payload: SesionClinicaItemUpdateInput) {
  const { data } = await api.patch<SesionClinicaItem>(
    `/tratamientos/pacientes/${pacienteId}/sesion-items/${itemId}`,
    payload,
  );
  return data;
}

export async function deleteSesionItem(pacienteId: string, itemId: string) {
  await api.delete(`/tratamientos/pacientes/${pacienteId}/sesion-items/${itemId}`);
}

export async function getNotasDentalesPaciente(pacienteId: string, pieza?: number) {
  const { data } = await api.get<NotaDental[]>(`/tratamientos/notas-dentales/${pacienteId}`, {
    params: pieza ? { pieza } : undefined,
  });
  return data;
}

export async function createNotaDental(data: NotaDentalCreateInput) {
  const { data: saved } = await api.post<NotaDental>('/tratamientos/notas-dentales', data);
  return saved;
}

export async function transcribeClinicalDictation(
  pacienteId: string,
  audio: Blob,
  options: { durationSeconds?: number | null; contexto?: 'ficha' | 'sesion' | 'historial' } = {},
) {
  const form = new FormData();
  const extension = audio.type.includes('wav') ? 'wav' : audio.type.includes('mpeg') || audio.type.includes('mp3') ? 'mp3' : 'webm';
  form.append('audio', audio, `dictado-clinico.${extension}`);
  if (options.durationSeconds != null) form.append('duracion_segundos', String(Math.round(options.durationSeconds)));
  form.append('contexto', options.contexto ?? 'ficha');
  const { data } = await api.post<DictadoTranscripcionResponse>(
    `/dictado/pacientes/${pacienteId}/transcribir`,
    form,
  );
  return data;
}

export async function saveClinicalDictationNote(pacienteId: string, payload: DictadoGuardarNotaInput) {
  const { data } = await api.post<DictadoNotaGuardadaResponse>(
    `/dictado/pacientes/${pacienteId}/guardar-nota`,
    payload,
  );
  return data;
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
  return openOrDownloadBlob(data, filename, {
    requirePdf: filename.toLowerCase().endsWith('.pdf') || data.type.toLowerCase().includes('pdf'),
  });
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
  const { data: created } = await api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos`, form);
  return created;
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
  const { data: created } = await api.post<DocumentoPaciente>(`/pacientes/${pacienteId}/documentos/generar-pdf`, data);
  return created;
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
  plantilla_id: string | null;
  tratamiento_id: string | null;
  historial_id: string | null;
  documento_id: string | null;
  estado: string;
  fecha_firma: string;
  documento_path: string | null;
  plantilla_version: string | null;
  contenido: string | null;
}>) {
  const { data: created } = await api.post<Consentimiento>(`/pacientes/${pacienteId}/consentimientos`, {
    tipo,
    doctor_id: doctorId,
    estado: extra?.estado ?? 'pendiente_firma',
    plantilla_version: extra?.plantilla_version ?? '2026.04',
    ...extra,
  });
  return created;
}

export async function firmarConsentimiento(consentimientoId: string, firmaPacienteBase64: string, firmaDoctorBase64?: string | null) {
  const { data: signed } = await api.post<Consentimiento>(`/consentimientos/${consentimientoId}/firmar`, {
    firma_paciente_base64: firmaPacienteBase64,
    firma_doctor_base64: firmaDoctorBase64 ?? null,
  });
  return signed;
}

export async function revocarConsentimiento(consentimientoId: string, motivo: string) {
  const { data: revoked } = await api.post<Consentimiento>(`/consentimientos/${consentimientoId}/revocar`, { motivo });
  return revoked;
}

export async function openConsentimientoPdf(consentimientoId: string) {
  const { data } = await api.get<Blob>(`/consentimientos/${consentimientoId}/pdf`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `consentimiento_${consentimientoId}.pdf`, { requirePdf: true });
}

export async function getRecetasPaciente(pacienteId: string) {
  return withDemoFallback(
    api.get<RecetaClinica[]>('/recetas', { params: { paciente_id: pacienteId } }),
    [] as RecetaClinica[],
  );
}

export async function getRecetaProviderStatus() {
  return withDemoFallback(
    api.get<RecetaProviderStatus>('/recetas/provider-status'),
    {
      mode: 'disabled',
      provider_available: false,
      real_certification_enabled: false,
      warning: 'Receta no certificada. Modo local/mock o proveedor real no configurado.',
    } satisfies RecetaProviderStatus,
  );
}

export async function getRecetaPlantillas() {
  return withDemoFallback(api.get<RecetaPlantilla[]>('/recetas/plantillas'), [] as RecetaPlantilla[]);
}

export async function importRecetaPlantilla(input: {
  archivo: File;
  nombre: string;
  campos_config?: Record<string, unknown> | null;
  requiere_dni?: boolean;
  requiere_fecha_nacimiento?: boolean;
}) {
  const formData = new FormData();
  formData.append('archivo', input.archivo);
  formData.append('nombre', input.nombre);
  if (input.campos_config) formData.append('campos_config', JSON.stringify(input.campos_config));
  formData.append('requiere_dni', String(input.requiere_dni ?? true));
  formData.append('requiere_fecha_nacimiento', String(input.requiere_fecha_nacimiento ?? false));
  const { data } = await api.post<RecetaPlantilla>('/recetas/plantillas', formData);
  return data;
}

export async function createRecetaClinica(pacienteId: string, data: RecetaCreateInput) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/pacientes/${pacienteId}`, data);
  return receta;
}

export async function updateRecetaClinica(recetaId: string, data: RecetaUpdateInput) {
  const { data: receta } = await api.patch<RecetaClinica>(`/recetas/${recetaId}`, data);
  return receta;
}

export async function firmarRecetaClinica(recetaId: string, firmaDataUrl: string) {
  const { data } = await api.post<RecetaClinica>(`/recetas/${recetaId}/firma`, { firma_data_url: firmaDataUrl });
  return data;
}

export async function emitirRecetaLocal(recetaId: string, data: RecetaEmitirInput = {}) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/${recetaId}/emitir-local`, data);
  return receta;
}

export async function enviarRecetaProveedor(recetaId: string, data: RecetaEmitirInput = {}) {
  const { data: receta } = await api.post<RecetaClinica>(`/recetas/${recetaId}/enviar-proveedor`, data);
  return receta;
}

export async function anularRecetaClinica(recetaId: string, motivo: string) {
  const { data } = await api.post<RecetaClinica>(`/recetas/${recetaId}/anular`, { motivo });
  return data;
}

export async function openRecetaClinicaPdf(recetaId: string) {
  const { data } = await api.get<Blob>(`/recetas/${recetaId}/pdf`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `receta_${recetaId}.pdf`, { requirePdf: true });
}

export async function getFormasPago() {
  return withDemoFallback(api.get<FormaPago[]>('/facturas/formas-pago'), DEMO_FORMAS_PAGO);
}

export async function createPresupuesto(pacienteId: string, doctorId: string, lineas: Array<{
  tratamiento_id: string;
  pieza_dental?: number | null;
  caras?: string | null;
  precio_unitario: string | number;
  descuento_porcentaje?: string | number;
}> = []) {
  const { data: created } = await api.post<Presupuesto>('/presupuestos', {
    paciente_id: pacienteId,
    doctor_id: doctorId,
    fecha: new Date().toISOString().slice(0, 10),
    lineas: lineas.map((linea) => ({
      tratamiento_id: linea.tratamiento_id,
      pieza_dental: linea.pieza_dental ?? null,
      caras: linea.caras || null,
      precio_unitario: Number(linea.precio_unitario),
      descuento_porcentaje: Number(linea.descuento_porcentaje ?? 0),
    })),
  });
  return created;
}

export async function presentarPresupuesto(presupuestoId: string) {
  const { data: presented } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/presentar`);
  return presented;
}

export async function aceptarPresupuesto(presupuestoId: string, lineaIds?: string[]) {
  const { data: accepted } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/aceptar`, {
    linea_ids: lineaIds ?? null,
    pasar_a_trabajo_pendiente: true,
  });
  return accepted;
}

export async function rechazarPresupuesto(presupuestoId: string, motivo?: string | null) {
  const { data: rejected } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/rechazar`, { motivo });
  return rejected;
}

export async function convertirPresupuestoFactura(presupuestoId: string, data?: { serie?: string; fecha?: string; forma_pago_id?: string | null }) {
  const { data: factura } = await api.post<Factura>(`/presupuestos/${presupuestoId}/convertir-a-factura`, {
    serie: data?.serie ?? 'A',
    fecha: data?.fecha ?? new Date().toISOString().slice(0, 10),
    forma_pago_id: data?.forma_pago_id ?? null,
    solo_aceptadas: true,
  });
  return factura;
}

export async function addPresupuestoLinea(presupuestoId: string, data: {
  tratamiento_id: string;
  pieza_dental?: number | null;
  caras?: string | null;
  precio_unitario: string | number;
  descuento_porcentaje?: string | number;
}) {
  const { data: created } = await api.post<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas`, {
    tratamiento_id: data.tratamiento_id,
    pieza_dental: data.pieza_dental ?? null,
    caras: data.caras || null,
    precio_unitario: Number(data.precio_unitario),
    descuento_porcentaje: Number(data.descuento_porcentaje ?? 0),
  });
  return created;
}

export async function updatePresupuestoLinea(presupuestoId: string, lineaId: string, data: Partial<{
  pieza_dental: number | null;
  caras: string | null;
  precio_unitario: string | number;
  descuento_porcentaje: string | number;
  aceptado: boolean;
}>) {
  const { data: updated } = await api.patch<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`, data);
  return updated;
}

export async function deletePresupuestoLinea(presupuestoId: string, lineaId: string) {
  await api.delete<void>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`);
}

export async function pasarPresupuestoTrabajoPendiente(presupuestoId: string) {
  const { data } = await api.post<unknown[]>(`/presupuestos/${presupuestoId}/pasar-trabajo-pendiente`);
  return data;
}

export async function createFacturaManual(pacienteId: string, concepto: string, importe: number) {
  const { data: factura } = await api.post<Factura>('/facturas', {
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
  });
  return factura;
}

export async function createFacturaDesdeHistorial(pacienteId: string, data: {
  fecha: string;
  serie: string;
  forma_pago_id?: string | null;
  descuento_porcentaje?: number;
  observaciones?: string | null;
  lineas: HistorialSinFacturar[];
}) {
  const descuento = Math.max(0, Math.min(100, Number(data.descuento_porcentaje ?? 0)));
  const { data: factura } = await api.post<Factura>('/facturas', {
    paciente_id: pacienteId,
    serie: data.serie || 'A',
    fecha: data.fecha,
    tipo: 'paciente',
    forma_pago_id: data.forma_pago_id ?? null,
    observaciones: data.observaciones ?? 'Factura generada desde historial clinico',
    lineas: data.lineas.map((linea) => ({
      historial_id: linea.id,
      concepto: linea.tratamiento_nombre,
      cantidad: 1,
      precio_unitario: Number(linea.tratamiento_precio) * (1 - descuento / 100),
      iva_porcentaje: Number(linea.tratamiento_iva ?? 0),
    })),
  });
  return factura;
}

export async function registrarCobro(facturaId: string, formaPagoId: string, importe: number) {
  const { data: factura } = await api.post<Factura>(`/facturas/${facturaId}/pagos`, {
    forma_pago_id: formaPagoId,
    importe,
  });
  return factura;
}

export async function getCitas(params: Record<string, string>) {
  const day = params.fecha_desde?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const demoCitas: Cita[] = [
    { id: 'demo-cita-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', gabinete_id: 'gab-1', fecha_hora: `${day}T15:00:00`, duracion_min: 30, estado: 'confirmada', motivo: 'Prueba corona 24', observaciones: 'Confirmada por WhatsApp', recordatorio_enviado: true, recordatorio_canal: 'whatsapp', recordatorio_estado: 'confirmado', recordatorio_at: `${day}T09:15:00`, confirmado_at: `${day}T09:18:00`, motivo_cancelacion: null, paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda }, laboratorio: [{ id: 'demo-labtrab-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', laboratorio_id: 'demo-lab-1', cita_id: 'demo-cita-1', tratamiento_id: 't-impl', presupuesto_linea_id: null, tipo_trabajo: 'Corona', descripcion: 'Corona zirconio 24', pieza_dental: 24, observaciones: 'Probar estructura antes de cementar', fecha_salida: `${day}T00:00:00`.slice(0, 10), fecha_entrega_prevista: `${day}T00:00:00`.slice(0, 10), fecha_recepcion: `${day}T00:00:00`.slice(0, 10), fecha_revision: null, fecha_entrega_paciente: null, ubicacion_clinica: 'Recepcion', estado: 'received_in_clinic', colocado: false, material_enviado: true, material_devuelto: false, laboratorio: { id: 'demo-lab-1', nombre: 'Laboratorio Norte', contacto: 'Laura' } }] },
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

function portalPatientParams(pacienteId?: string | null) {
  return pacienteId ? { paciente_id: pacienteId } : {};
}

function demoPortalPatient(pacienteId?: string | null) {
  return DEMO_PACIENTES.find((item) => item.id === pacienteId) ?? DEMO_PACIENTES[0];
}

export async function getPortalMe(pacienteId?: string | null) {
  const paciente = demoPortalPatient(pacienteId);
  return withDemoFallback(api.get<PortalMe>('/portal/me', { params: portalPatientParams(pacienteId) }), {
    paciente,
    resumen: {
      proximas_citas: 1,
      documentos: DEMO_DOCUMENTOS.filter((item) => item.paciente_id === paciente.id || paciente.id.startsWith('demo-')).length,
      consentimientos_pendientes: DEMO_CONSENTIMIENTOS.filter((item) => item.estado === 'pendiente_firma').length,
    },
  });
}

export async function getPortalCitas(pacienteId?: string | null) {
  const fallback = await getPacienteCitas(demoPortalPatient(pacienteId).id);
  return withDemoFallback(api.get<Cita[]>('/portal/citas', { params: portalPatientParams(pacienteId) }), fallback);
}

export async function confirmarPortalCita(citaId: string, pacienteId?: string | null) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/confirmar`, null, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function cancelarPortalCita(citaId: string, pacienteId: string | null | undefined, motivo: string, reprogramar = false) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/cancelar`, {
    motivo_cancelacion: motivo,
    tipo: reprogramar ? 'reprogramada' : 'anulacion_paciente',
    crear_telefonear: reprogramar,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function solicitarCambioPortalCita(citaId: string, pacienteId: string | null | undefined, motivo: string) {
  const { data } = await api.post<Cita>(`/portal/citas/${citaId}/solicitar-cambio`, {
    motivo,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function getPortalDocumentos(pacienteId?: string | null) {
  const fallback = await getDocumentosPaciente(demoPortalPatient(pacienteId).id);
  return withDemoFallback(api.get<DocumentoPaciente[]>('/portal/documentos', { params: portalPatientParams(pacienteId) }), fallback);
}

export async function getPortalConsentimientos(pacienteId?: string | null) {
  const fallback = await getConsentimientosPaciente(demoPortalPatient(pacienteId).id);
  return withDemoFallback(api.get<Consentimiento[]>('/portal/consentimientos', { params: portalPatientParams(pacienteId) }), fallback);
}

export async function firmarPortalConsentimiento(consentimientoId: string, pacienteId: string | null | undefined, firmaPacienteBase64: string) {
  const { data } = await api.post<Consentimiento>(`/portal/consentimientos/${consentimientoId}/firmar`, {
    firma_paciente_base64: firmaPacienteBase64,
  }, { params: portalPatientParams(pacienteId) });
  return data;
}

export async function validatePortalInvitation(token: string) {
  const { data } = await api.post<PortalPublicMe>('/portal/public/validate', { token });
  return data;
}

export async function getPortalPublicMe(token: string) {
  const { data } = await api.post<PortalPublicMe>('/portal/public/me', { token });
  return data;
}

export async function getPortalPublicCitas(token: string) {
  const { data } = await api.post<PortalPublicCita[]>('/portal/public/citas', { token });
  return data;
}

export async function confirmarPortalPublicCita(token: string, citaId: string) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/confirmar`, { token });
  return data;
}

export async function cancelarPortalPublicCita(token: string, citaId: string, motivo: string, reprogramar = false) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/cancelar`, {
    token,
    motivo_cancelacion: motivo,
    reprogramar,
  });
  return data;
}

export async function solicitarCambioPortalPublicCita(token: string, citaId: string, motivo: string) {
  const { data } = await api.post<PortalPublicCita>(`/portal/public/citas/${citaId}/solicitar-cambio`, {
    token,
    motivo,
  });
  return data;
}

export async function getPortalPublicDocumentos(token: string) {
  const { data } = await api.post<PortalPublicDocumento[]>('/portal/public/documentos', { token });
  return data;
}

export async function openPortalPublicDocumento(token: string, documentoId: string, filename = 'documento.pdf') {
  const { data } = await api.post<Blob>(`/portal/public/documentos/${documentoId}/descargar`, { token }, { responseType: 'blob' });
  return openOrDownloadBlob(data, filename, {
    requirePdf: filename.toLowerCase().endsWith('.pdf') || data.type.toLowerCase().includes('pdf'),
  });
}

export async function getPortalPublicConsentimientos(token: string) {
  const { data } = await api.post<PortalPublicConsentimiento[]>('/portal/public/consentimientos', { token });
  return data;
}

export async function firmarPortalPublicConsentimiento(token: string, consentimientoId: string, firmaPacienteBase64: string) {
  const { data } = await api.post<PortalPublicConsentimiento>(`/portal/public/consentimientos/${consentimientoId}/firmar`, {
    token,
    firma_paciente_base64: firmaPacienteBase64,
  });
  return data;
}

export async function enviarRecordatorioCita(citaId: string, canal: 'whatsapp' | 'email' | 'ambos', mensaje?: string) {
  const { data } = await api.post<RecordatorioCitaResponse>(`/citas/${citaId}/recordatorio`, { canal, mensaje });
  return data;
}

export async function getWhatsAppComunicaciones(params: {
  patient_id?: string;
  appointment_id?: string;
  direction?: 'inbound' | 'outbound';
  processed?: boolean;
  intent?: string;
  limit?: number;
} = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const fallback: WhatsAppInboxItem[] = [
    {
      id: 'demo-wa-1',
      clinica_id: 'demo-clinica-1',
      patient_id: 'demo-pac-2',
      appointment_id: 'demo-cita-2',
      direction: 'inbound' as const,
      phone: '600000001',
      message_body: 'No puedo, necesito cambiar la cita',
      received_at: `${day}T09:35:00`,
      sent_at: null,
      interpreted_intent: 'reschedule_requested',
      processed: false,
      provider_message_id: 'demo-wa-msg-1',
      idempotency_key: 'demo-inbound-wa-1',
      raw_payload: null,
      created_at: `${day}T09:35:00`,
      patient: { id: 'demo-pac-2', nombre: 'PILAR', apellidos: 'OJEDA CALVO', num_historial: 91313 },
      appointment: { id: 'demo-cita-2', fecha_hora: `${day}T16:10:00`, estado: 'reminder_sent', motivo: 'Ortodoncia', doctor_nombre: DEMO_DOCTORES[1].nombre, doctor_id: 'demo-doc-2', gabinete_id: 'gab-2', duracion_min: 40 },
    },
    {
      id: 'demo-wa-2',
      clinica_id: 'demo-clinica-1',
      patient_id: 'demo-pac-1',
      appointment_id: 'demo-cita-1',
      direction: 'outbound' as const,
      phone: '942503186',
      message_body: 'Hola CESAR, le recordamos su cita.',
      received_at: null,
      sent_at: `${day}T09:15:00`,
      interpreted_intent: null,
      processed: true,
      provider_message_id: null,
      idempotency_key: null,
      raw_payload: null,
      created_at: `${day}T09:15:00`,
      patient: { id: 'demo-pac-1', nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', num_historial: 91312 },
      appointment: { id: 'demo-cita-1', fecha_hora: `${day}T15:00:00`, estado: 'confirmed', motivo: 'Revision', doctor_nombre: DEMO_DOCTORES[0].nombre, doctor_id: 'demo-doc-1', gabinete_id: 'gab-1', duracion_min: 30 },
    },
  ].filter((item) => {
    if (params.patient_id && item.patient_id !== params.patient_id && !params.patient_id.startsWith('demo-')) return false;
    if (params.appointment_id && item.appointment_id !== params.appointment_id) return false;
    if (params.direction && item.direction !== params.direction) return false;
    if (params.processed !== undefined && item.processed !== params.processed) return false;
    if (params.intent && item.interpreted_intent !== params.intent) return false;
    return true;
  });
  return withDemoFallback(api.get<WhatsAppInboxItem[]>('/whatsapp/comunicaciones', { params }), fallback);
}

export async function aplicarAccionWhatsApp(
  communicationId: string,
  action: 'confirm' | 'cancel' | 'mark_pending' | 'manual_review' | 'mark_reviewed' | 'ignore',
  note?: string,
) {
  const { data } = await api.post<WhatsAppInboxItem>(`/whatsapp/comunicaciones/${communicationId}/accion`, { action, note });
  return data;
}

export async function reprogramarWhatsAppComunicacion(
  communicationId: string,
  data: {
    fecha_hora: string;
    duracion_min?: number;
    gabinete_id?: string | null;
    forzar_fuera_horario?: boolean;
    note?: string | null;
  },
) {
  const { data: updated } = await api.post<WhatsAppInboxItem>(`/whatsapp/comunicaciones/${communicationId}/reprogramar`, data);
  return updated;
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

export async function getDisponibilidadDoctor(params: { doctor_id: string; desde: string; dias?: number }) {
  return withDemoFallback(api.get<DisponibilidadDia[]>('/citas/disponibilidad', { params }), [{
    doctor_id: params.doctor_id,
    fecha: params.desde,
    bloques: [{ inicio: '09:00', fin: '13:30' }, { inicio: '15:00', fin: '20:30' }],
    intervalo_min: 10,
    trabaja: true,
  }]);
}

export async function createCita(data: {
  paciente_id: string;
  doctor_id: string;
  gabinete_id?: string | null;
  presupuesto_linea_id?: string | null;
  fecha_hora: string;
  duracion_min: number;
  motivo?: string | null;
  observaciones?: string | null;
  recordatorio_enviado?: boolean;
  recordatorio_canal?: string | null;
  recordatorio_estado?: string | null;
  motivo_cancelacion?: string | null;
}) {
  const { data: created } = await api.post<Cita>('/citas', data);
  return created;
}

export async function updateCita(citaId: string, data: Partial<{
  doctor_id: string;
  gabinete_id: string | null;
  presupuesto_linea_id: string | null;
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
  const { data: updated } = await api.patch<Cita>(`/citas/${citaId}`, data);
  return updated;
}

export async function reprogramarCita(citaId: string, data: {
  doctor_id?: string | null;
  gabinete_id?: string | null;
  fecha_hora: string;
  duracion_min?: number;
  forzar_fuera_horario?: boolean;
  motivo?: string | null;
}) {
  const { data: updated } = await api.patch<Cita>(`/citas/${citaId}/reprogramar`, data);
  return updated;
}

export async function confirmarCita(citaId: string) {
  const { data: confirmed } = await api.post<Cita>(`/citas/${citaId}/confirmar`);
  return confirmed;
}

export async function cancelarCitaAvanzada(citaId: string, data: {
  motivo_cancelacion: string;
  tipo?: 'anulacion_paciente' | 'anulacion_clinica' | 'no_vino' | 'reprogramada' | 'otro';
  crear_telefonear?: boolean;
}) {
  const { data: cancelled } = await api.post<Cita>(`/citas/${citaId}/cancelar`, data);
  return cancelled;
}

export async function marcarFaltaCita(citaId: string, motivo: string) {
  const { data: missed } = await api.post<Cita>(`/citas/${citaId}/marcar-falta`, {
    motivo_cancelacion: motivo,
    tipo: 'no_vino',
  });
  return missed;
}

export async function getCambiosCita(citaId: string) {
  return withDemoFallback(api.get<CitaCambio[]>(`/citas/${citaId}/cambios`), []);
}

export async function getMyDoctorNotifications(unreadOnly = false) {
  return withDemoFallback(api.get<DoctorNotification[]>('/notificaciones/mias', {
    params: { unread_only: unreadOnly },
  }), []);
}

export async function markDoctorNotificationRead(notificationId: string) {
  const { data } = await api.post<DoctorNotification>(`/notificaciones/${notificationId}/leer`);
  return data;
}

export async function getTrabajadoresFichaje() {
  return withDemoFallback(api.get<TrabajadorFichaje[]>('/fichajes/trabajadores'), demoTrabajadoresFichaje());
}

export async function getUltimoFichajeTrabajador(trabajadorId: string) {
  return withDemoFallback(
    api.get<FichajeTrabajador | null>(`/fichajes/ultimo/${trabajadorId}`),
    null,
  );
}

export async function registrarFichaje(data: {
  trabajador_id: string;
  pin: string;
  tipo: TipoFichaje;
}) {
  const { data: registered } = await api.post<FichajeRegistroResponse>('/fichajes', data);
  return registered;
}

export async function getTelefonear() {
  return withDemoFallback(api.get<TelefonearPendiente[]>('/citas/panel/telefonear/pendientes'), [
    { id: 'demo-tel-1', cita_original_id: 'demo-cita-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', nueva_cita_id: null, paciente: { nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', telefono: '942503186' }, doctor: { nombre: DEMO_DOCTORES[0].nombre, color_agenda: DEMO_DOCTORES[0].color_agenda }, motivo: 'Confirmar cita', notas: 'Prefiere tarde', estado_contacto: 'pendiente', ultimo_intento_at: null, proximo_intento_at: new Date().toISOString(), reubicada: false },
    { id: 'demo-tel-2', cita_original_id: 'demo-cita-2', paciente_id: 'demo-pac-2', doctor_id: 'demo-doc-2', nueva_cita_id: null, paciente: { nombre: 'PILAR', apellidos: 'OJEDA CALVO', telefono: '600000001' }, doctor: { nombre: DEMO_DOCTORES[1].nombre, color_agenda: DEMO_DOCTORES[1].color_agenda }, motivo: 'Buscar hueco', notas: 'No responde a primera hora', estado_contacto: 'no_responde', ultimo_intento_at: new Date().toISOString(), proximo_intento_at: null, reubicada: false },
  ]);
}

export async function marcarTelefonearReubicada(entradaId: string, nuevaCitaId: string) {
  const { data } = await api.patch<TelefonearPendiente>(`/citas/telefonear/${entradaId}/reubicar`, null, {
    params: { nueva_cita_id: nuevaCitaId },
  });
  return data;
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
  const { data: created } = await api.post<Doctor>('/doctores', data);
  return created;
}

export async function updateDoctor(doctorId: string, data: Partial<{
  nombre: string;
  especialidad: string | null;
  color_agenda: string | null;
  es_auxiliar: boolean;
  porcentaje: string | number | null;
  activo: boolean;
}>) {
  const { data: updated } = await api.patch<Doctor>(`/doctores/${doctorId}`, data);
  return updated;
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
  const { data: updated } = await api.put<HorarioDoctor>(`/doctores/${doctorId}/horarios/${diaSemana}`, data);
  return updated;
}

export async function getFamiliasTratamiento() {
  return withDemoFallback(api.get<FamiliaTratamiento[]>('/tratamientos/familias'), DEMO_FAMILIAS);
}

export async function createFamiliaTratamiento(data: { nombre: string; icono?: string | null; orden?: number }) {
  const { data: created } = await api.post<FamiliaTratamiento>('/tratamientos/familias', {
    nombre: data.nombre,
    icono: data.icono ?? null,
    orden: data.orden ?? 0,
  });
  return created;
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
  const { data: created } = await api.post<TratamientoCatalogo>('/tratamientos', {
    ...data,
    iva_porcentaje: data.iva_porcentaje ?? 0,
    requiere_pieza: Boolean(data.requiere_pieza),
    requiere_caras: Boolean(data.requiere_caras),
  });
  return created;
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
  const { data: updated } = await api.patch<TratamientoCatalogo>(`/tratamientos/${id}`, data);
  return updated;
}

export async function deactivateTratamientoCatalogo(id: string) {
  const { data } = await api.delete<TratamientoCatalogo>(`/tratamientos/${id}`);
  return data;
}

export async function getInventario() {
  return withDemoFallback(api.get<ProductoInventario[]>('/inventario'), [
    { id: 'demo-prod-1', clinica_id: null, nombre: 'Amoxicilina', categoria: 'Farmacia', sku: null, stock_min: 10, stock_act: 50, unidad: 'caja', coste_unitario: 12, proveedor_id: null, activo: true },
    { id: 'demo-prod-2', clinica_id: null, nombre: 'Guantes nitrilo M', categoria: 'Desechable', sku: null, stock_min: 20, stock_act: 8, unidad: 'caja', coste_unitario: 6, proveedor_id: null, activo: true },
  ]);
}

export async function getAlertasStock() {
  return withDemoFallback(api.get<ProductoInventario[]>('/inventario/alertas-stock'), []);
}

export async function createProductoInventario(data: Partial<ProductoInventario> & { nombre: string; stock_min: number; stock_act: number }) {
  const { data: created } = await api.post<ProductoInventario>('/inventario', data);
  return created;
}

export async function updateProductoInventario(id: string, data: Partial<ProductoInventario>) {
  const { data: updated } = await api.patch<ProductoInventario>(`/inventario/${id}`, data);
  return updated;
}

export async function getMovimientosInventario(productoId: string) {
  return withDemoFallback(api.get<MovimientoInventario[]>(`/inventario/${productoId}/movimientos`), []);
}

export async function registrarMovimientoInventario(productoId: string, data: {
  tipo: MovimientoInventario['tipo'];
    cantidad: number;
    motivo?: string | null;
    factura_id?: string | null;
    referencia_tipo?: string | null;
    referencia_id?: string | null;
}) {
  const { data: updated } = await api.post<ProductoInventario>(`/inventario/${productoId}/movimientos`, data);
  return updated;
}

export async function getProveedoresInventario() {
  return withDemoFallback(api.get<ProveedorInventario[]>('/inventario/proveedores'), []);
}

export async function createProveedorInventario(data: {
  nombre: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  notas?: string | null;
}) {
  const { data: created } = await api.post<ProveedorInventario>('/inventario/proveedores', data);
  return created;
}

export async function getPedidosInventario() {
  return withDemoFallback(api.get<PedidoProveedorInventario[]>('/inventario/pedidos'), []);
}

export async function createPedidoInventario(data: {
  proveedor_id: string;
  fecha?: string | null;
  notas?: string | null;
  lineas: { producto_id: string; cantidad: number; coste_unitario: number }[];
}) {
  const { data: created } = await api.post<PedidoProveedorInventario>('/inventario/pedidos', data);
  return created;
}

export async function updatePedidoInventario(id: string, data: Partial<PedidoProveedorInventario>) {
  const { data: updated } = await api.patch<PedidoProveedorInventario>(`/inventario/pedidos/${id}`, data);
  return updated;
}

export async function recibirPedidoInventario(id: string) {
  const { data } = await api.post<PedidoProveedorInventario>(`/inventario/pedidos/${id}/recibir`);
  return data;
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

export async function getProductionReadiness() {
  return withDemoFallback(api.get<ProductionReadinessReport>('/admin/produccion/preflight'), {
    overall: 'warn',
    generated_at: new Date().toISOString(),
    totals: { ok: 6, warn: 4, fail: 1 },
    checks: [
      {
        status: 'warn',
        area: 'entorno',
        titulo: 'Modo demo/desarrollo',
        detalle: 'Informe de ejemplo sin conexion al backend.',
        accion_recomendada: 'Conectar backend y revisar el preflight real antes de produccion.',
      },
    ],
    next_steps: [
      'Validacion juridica RGPD/LOPDGDD.',
      'Validacion fiscal VERI*FACTU/SIF.',
      'Prueba de restauracion de backup.',
    ],
  });
}

export async function getAuditLog(params: {
  desde?: string;
  hasta?: string;
  accion?: string;
  entidad?: string;
  clinica_id?: string;
} = {}) {
  return withDemoFallback(api.get<AuditLogEntry[]>('/admin/auditoria', { params }), []);
}

export async function crearBackup(alcance: 'database' | 'uploads' | 'full' = 'full') {
  const { data } = await api.post<BackupRegistro>('/admin/backups', { alcance });
  return data;
}

export async function verificarBackup(backupId: string) {
  const { data } = await api.get<{ ok: boolean; motivo?: string; hash_actual?: string; tamano_bytes?: number; tablas?: number; uploads?: number; created_at?: string }>(`/admin/backups/${backupId}/verificar`);
  return data;
}

export async function simularRestauracionBackup(backupId: string) {
  const { data } = await api.get<{ ok: boolean; motivo?: string; dry_run?: boolean; tablas?: number; uploads?: number; advertencias?: string[] }>(`/admin/backups/${backupId}/simular-restauracion`);
  return data;
}

export async function registrarPruebaRestauracionBackup(backupId: string, resultado: 'ok' | 'fallido', notas?: string) {
  const { data } = await api.post<BackupRegistro>(`/admin/backups/${backupId}/registrar-prueba-restauracion`, {
    resultado,
    notas,
  });
  return data;
}

export async function descargarBackup(backupId: string) {
  const { data } = await api.get<Blob>(`/admin/backups/${backupId}/descargar`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dentcore-backup-${backupId}.dentcorebak`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function recetaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/facturas/${facturaId}/receta`;
}

export async function emitirRecetaPdf(facturaId: string) {
  const { data } = await api.post<Blob>(`/facturas/${facturaId}/receta`, undefined, { responseType: 'blob' });
  return openOrDownloadBlob(data, `receta-${facturaId}.pdf`, { requirePdf: true });
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

export async function createTrabajoLaboratorio(data: TrabajoLaboratorioCreateInput) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>('/laboratorio/trabajos', data);
  return trabajo;
}

export async function asociarTrabajoLaboratorioCita(trabajoId: string, citaId: string | null) {
  const { data: trabajo } = await api.patch<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/asociar-cita`, {
    cita_id: citaId,
  });
  return trabajo;
}

export async function marcarTrabajoLaboratorioRecibido(
  trabajoId: string,
  payload: { fecha?: string | null; ubicacion_clinica?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/recibir`, payload);
  return trabajo;
}

export async function marcarTrabajoLaboratorioRevisado(
  trabajoId: string,
  payload: { fecha?: string | null; ubicacion_clinica?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/revisar`, payload);
  return trabajo;
}

export async function marcarTrabajoLaboratorioEntregado(
  trabajoId: string,
  payload: { fecha?: string | null; observaciones?: string | null } = {},
) {
  const { data: trabajo } = await api.post<TrabajoLaboratorio>(`/laboratorio/trabajos/${trabajoId}/entregar`, payload);
  return trabajo;
}

export async function getTrabajosLaboratorioCita(citaId: string) {
  const { data: trabajos } = await api.get<TrabajoLaboratorio[]>(`/laboratorio/citas/${citaId}/trabajos`);
  return trabajos;
}

export async function getTrabajosLaboratorio(params: { pendientes?: boolean; proximos?: boolean; vencidos?: boolean; estado?: string; paciente_id?: string; cita_id?: string } = {}) {
  const trabajos: TrabajoLaboratorio[] = [
    { id: 'demo-labtrab-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', laboratorio_id: 'demo-lab-1', historial_id: null, cita_id: 'demo-cita-1', tratamiento_id: 't-impl', presupuesto_id: 'demo-pres-1', factura_id: null, referencia: 'LAB-24-ZIR', tipo_trabajo: 'Corona', descripcion: 'Corona zirconio 24', pieza_dental: 24, color: 'A2', observaciones: 'Probar estructura', fecha_salida: '2026-04-20', fecha_entrega_prevista: '2026-04-28', fecha_recepcion: null, fecha_revision: null, fecha_entrega_paciente: null, ubicacion_clinica: null, estado: 'enviado', precio: 120, coste_laboratorio: 120, precio_paciente: 290, margen: 170, comision_doctor_pct: 0, estado_pago_laboratorio: 'pendiente', estado_cobro_paciente: 'pendiente', paciente: { id: 'demo-pac-1', nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', num_historial: 91312 }, doctor: { id: 'demo-doc-1', nombre: DEMO_DOCTORES[0].nombre }, laboratorio: { id: 'demo-lab-1', nombre: 'Laboratorio Norte', telefono: '942000001', whatsapp: '600100100', email: 'lab@example.test', contacto: 'Laura', notas: null, activo: true } },
  ];
  const filtered = trabajos.filter((item) => {
    if (params.paciente_id && item.paciente_id !== params.paciente_id && !params.paciente_id.startsWith('demo-')) return false;
    if (params.cita_id && item.cita_id !== params.cita_id && !params.cita_id.startsWith('demo-')) return false;
    if (params.estado && item.estado !== params.estado) return false;
    if (params.pendientes && !['pendiente', 'pendiente_enviar', 'enviado', 'en_proceso', 'en_fabricacion', 'pending_to_send', 'sent_to_lab', 'in_progress_at_lab', 'ready_at_lab'].includes(item.estado)) return false;
    return true;
  });
  return withDemoFallback(api.get<TrabajoLaboratorio[]>('/laboratorio/trabajos', { params }), filtered);
}

type ReportDateParams = {
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  doctor_id?: string;
  clinica_id?: string;
  tratamiento_id?: string;
};

export function getReportKpis(): Promise<ReportKpis>;
export function getReportKpis(params: ReportDateParams): Promise<ReportKpis>;
export async function getReportKpis(params: ReportDateParams = {}): Promise<ReportKpis> {
  return withDemoFallback(api.get<ReportKpis>('/reportes/kpis', { params }), {
    citas: { total: 18, por_estado: { confirmada: 12, atendida: 4, falta: 2 }, asistencia: 4, faltas: 2, anuladas: 0, no_show_rate: 11.1 },
    pacientes_nuevos: 5,
    facturacion: { num_facturas: 7, total_facturado: 4260, total_cobrado: 3110, pendiente: 1150, ticket_medio: 608.57 },
    tratamientos_realizados: 22,
    presupuestos: { total: 9, por_estado: { borrador: 2, aceptado: 5, rechazado: 2 }, aceptacion_rate: 55.5, rechazo_rate: 22.2 },
  });
}

export function getReportDashboard(): Promise<ReportDashboard>;
export function getReportDashboard(params: ReportDateParams): Promise<ReportDashboard>;
export async function getReportDashboard(params: ReportDateParams = {}): Promise<ReportDashboard> {
  const fallbackKpis: ReportKpis = {
    citas: { total: 18, por_estado: { programada: 3, confirmada: 8, en_clinica: 2, atendida: 4, falta: 1 }, asistencia: 4, faltas: 1, anuladas: 0, no_show_rate: 5.55 },
    pacientes_nuevos: 5,
    facturacion: { num_facturas: 7, total_facturado: 4260, total_cobrado: 3110, pendiente: 1150, ticket_medio: 608.57 },
    tratamientos_realizados: 22,
    presupuestos: { total: 9, por_estado: { borrador: 2, presentado: 1, aceptado: 5, rechazado: 1 }, aceptacion_rate: 55.5, rechazo_rate: 11.1 },
  };
  return withDemoFallback(api.get<ReportDashboard>('/reportes/dashboard', { params }), {
    periodo: { desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), hasta: new Date().toISOString().slice(0, 10) },
    kpis: fallbackKpis,
    series: {
      ingresos_mensuales: Array.from({ length: 12 }, (_, index) => ({
        mes: index + 1,
        facturado: index < new Date().getMonth() + 1 ? 1800 + index * 220 : 0,
        cobrado: index < new Date().getMonth() + 1 ? 1400 + index * 180 : 0,
        num_facturas: index < new Date().getMonth() + 1 ? 4 + index : 0,
      })),
    },
    doctores: DEMO_DOCTORES.map((doctor, index) => ({
      doctor_id: doctor.id,
      doctor: doctor.nombre,
      color: doctor.color_agenda,
      total: 14 - index,
      atendidas: 9 - index,
      faltas: index,
      ocupacion_pct: 62 - index * 8,
    })),
    tratamientos: DEMO_TRATAMIENTOS.slice(0, 5).map((item, index) => ({
      tratamiento: item.nombre,
      cantidad: 12 - index,
      importe: (12 - index) * Number(item.precio),
    })),
    pacientes_deuda: DEMO_PACIENTES.slice(0, 2).map((paciente, index) => ({
      id: paciente.id,
      num_historial: paciente.num_historial,
      nombre: paciente.nombre,
      apellidos: paciente.apellidos,
      saldo_pendiente: index === 0 ? 145 : 80,
    })),
    alertas: {
      citas_sin_confirmar: 3,
      pacientes_en_clinica: 2,
      faltas_periodo: 1,
      deuda_pendiente: 1150,
      presupuestos_pendientes: 3,
    },
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

export function getReportTopTratamientos(): Promise<ReportTopTratamiento[]>;
export function getReportTopTratamientos(params: ReportDateParams): Promise<ReportTopTratamiento[]>;
export async function getReportTopTratamientos(params: ReportDateParams = {}): Promise<ReportTopTratamiento[]> {
  return withDemoFallback(api.get<ReportTopTratamiento[]>('/reportes/top-tratamientos', { params }), DEMO_TRATAMIENTOS.slice(0, 5).map((item, index) => ({
    tratamiento: item.nombre,
    cantidad: 12 - index,
  })));
}

export function getReportCitasDoctor(): Promise<ReportCitasDoctor[]>;
export function getReportCitasDoctor(params: ReportDateParams): Promise<ReportCitasDoctor[]>;
export async function getReportCitasDoctor(params: ReportDateParams = {}): Promise<ReportCitasDoctor[]> {
  return withDemoFallback(api.get<ReportCitasDoctor[]>('/reportes/citas-por-doctor', { params }), DEMO_DOCTORES.map((doctor, index) => ({
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

function demoOdontograma(pacienteId: string): OdontogramaPaciente {
  return {
    id: `demo-odon-${pacienteId}`,
    paciente_id: pacienteId,
    clinica_id: 'demo-clinica-1',
    version: 1,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
    piezas: [
      {
        id: `demo-odon-piece-${pacienteId}-24`,
        odontograma_id: `demo-odon-${pacienteId}`,
        pieza_fdi: 24,
        estado_general: 'caries',
        notas: 'Control en presupuesto',
        superficies: [
          { id: 'demo-sup-24-o', pieza_id: `demo-odon-piece-${pacienteId}-24`, superficie: 'oclusal_incisal', condicion: 'tratamiento_pendiente', tratamiento_planificado_id: 't-endo', tratamiento_realizado_id: null, color_estado: '#f59e0b', notas: 'Endodoncia propuesta' },
        ],
      },
      {
        id: `demo-odon-piece-${pacienteId}-37`,
        odontograma_id: `demo-odon-${pacienteId}`,
        pieza_fdi: 37,
        estado_general: 'implante',
        notas: null,
        superficies: [],
      },
    ],
  };
}

export async function getOdontogramaPaciente(pacienteId: string) {
  return withDemoFallback(api.get<OdontogramaPaciente>(`/pacientes/${pacienteId}/odontograma`), demoOdontograma(pacienteId));
}

export async function getOdontogramaContexto(
  pacienteId: string,
  mode: OdontogramaContextMode,
  contextId?: string | null,
) {
  const fallback = demoOdontograma(pacienteId);
  const teeth = Object.fromEntries(fallback.piezas.map((pieza) => [
    String(pieza.pieza_fdi),
    {
      base: {
        estado_general: pieza.estado_general,
        movilidad: pieza.movilidad ?? null,
        pronostico: pieza.pronostico ?? null,
        notas: pieza.notas,
      },
      surfaces: Object.fromEntries(pieza.superficies.map((surface) => [
        surface.superficie,
        {
          diagnostico: surface.condicion,
          context_state: mode === 'presupuesto' ? 'incluido_presupuesto' : surface.condicion,
          tratamiento_id: surface.tratamiento_planificado_id ?? surface.tratamiento_realizado_id,
          presupuesto_linea_id: surface.presupuesto_linea_id ?? null,
          label: surface.notas,
          amount: null,
        },
      ])),
    },
  ]));
  return withDemoFallback(api.get<OdontogramaContexto>(`/pacientes/${pacienteId}/odontograma/contexto`, {
    params: { mode, context_id: contextId || undefined },
  }), {
    mode,
    odontograma_id: fallback.id,
    paciente_id: pacienteId,
    denticion: fallback.denticion ?? 'adulta',
    teeth,
  });
}

export async function createOdontogramaPaciente(pacienteId: string) {
  const response = await api.post<OdontogramaPaciente>(`/pacientes/${pacienteId}/odontograma`);
  return response.data;
}

export async function updateOdontogramaPieza(odontogramaId: string, piezaFdi: number, data: {
  estado_general?: OdontogramaStatus | string;
  notas?: string | null;
}) {
  const response = await api.patch<OdontogramaPieza>(
    `/odontogramas/${odontogramaId}/piezas/${piezaFdi}`,
    data,
  );
  return response.data;
}

export async function updateOdontogramaSuperficie(odontogramaId: string, piezaFdi: number, superficie: OdontogramaSurfaceName, data: {
  condicion?: OdontogramaStatus | string;
  tratamiento_planificado_id?: string | null;
  tratamiento_realizado_id?: string | null;
  color_estado?: string | null;
  notas?: string | null;
}) {
  const response = await api.patch<OdontogramaSuperficie>(
    `/odontogramas/${odontogramaId}/piezas/${piezaFdi}/superficies/${superficie}`,
    data,
  );
  return response.data;
}

export async function getOdontogramaHistorial(odontogramaId: string) {
  return withDemoFallback(api.get<OdontogramaEvento[]>(`/odontogramas/${odontogramaId}/historial`), []);
}

export async function duplicateOdontogramaVersion(odontogramaId: string) {
  const response = await api.post<OdontogramaPaciente>(`/odontograma/${odontogramaId}/duplicar-version`);
  return response.data;
}

export async function createPresupuestoFromOdontograma(odontogramaId: string, data: {
  doctor_id: string;
  items?: Array<{ pieza_fdi: number; superficie?: OdontogramaSurfaceName | null; tratamiento_id: string; precio_unitario: string | number }>;
  pie_pagina?: string | null;
}) {
  const response = await api.post<{ presupuesto_id: string; lineas_creadas: number }>(
    `/odontogramas/${odontogramaId}/generar-presupuesto`,
    data,
  );
  return response.data;
}

export async function saveOdontograma(presupuestoId: string, odontograma: OdontogramaPlan) {
  const response = await api.put<{ presupuesto_id: string; odontograma: OdontogramaPlan }>(
    `/presupuestos/${presupuestoId}/odontograma`,
    { odontograma },
  );
  return response.data;
}

export function facturaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/pdf/facturas/${facturaId}`;
}

export function presupuestoPdfUrl(presupuestoId: string) {
  return `${api.defaults.baseURL}/pdf/presupuestos/${presupuestoId}`;
}

export async function openFacturaPdf(facturaId: string) {
  const { data } = await api.get<Blob>(`/pdf/facturas/${facturaId}`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `factura_${facturaId}.pdf`, { requirePdf: true });
}

export async function openPresupuestoPdf(presupuestoId: string) {
  const { data } = await api.get<Blob>(`/pdf/presupuestos/${presupuestoId}`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `presupuesto_${presupuestoId}.pdf`, { requirePdf: true });
}

function shouldUseDemo(error?: unknown) {
  const axiosError = error as AxiosError | undefined;
  return import.meta.env.DEV && DEMO_FALLBACK_ENABLED && Boolean(axiosError?.isAxiosError && !axiosError.response);
}

function demoLogin(username: string, password: string, error?: unknown) {
  if (!shouldUseDemo(error)) return null;
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

function demoTrabajadoresFichaje(): TrabajadorFichaje[] {
  const user = getDemoUser();
  if (!user || user.rol === 'paciente') return [];
  return [
    {
      id: user.id,
      nombre: user.nombre,
      origen: 'usuario',
      codigo: user.username,
      rol: user.rol,
      clinica_id: user.clinica_id ?? null,
      pin_configurado: true,
    },
  ];
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
