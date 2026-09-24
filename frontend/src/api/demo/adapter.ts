import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import type { OdontogramaContextMode } from '../types';
import { getStoredAuthToken } from '../session';
import * as identity from './identity';
import * as patients from './patients';
import * as scheduling from './scheduling';
import * as clinical from './clinical';
import * as treatmentPlans from './treatmentPlans';
import * as billing from './billing';
import * as documents from './documents';
import * as consents from './consents';
import * as prescriptions from './prescriptions';
import * as portal from './portal';
import * as communications from './communications';
import * as workforce from './workforce';
import * as treatmentCatalog from './treatmentCatalog';
import * as inventory from './inventory';
import * as reporting from './reporting';
import * as administration from './administration';
import * as laboratory from './laboratory';
import * as odontogram from './odontogram';

type DemoRequest = { params: Record<string, string>; query: Record<string, unknown> };
type DemoRead = (request: DemoRequest) => Promise<unknown>;

function query<T>(request: DemoRequest): T {
  return request.query as T;
}

function patientQuery(request: DemoRequest) {
  return typeof request.query.paciente_id === 'string' ? request.query.paciente_id : undefined;
}

// Only explicit read models are simulated. Clinical and financial writes remain unavailable.
const reads: Array<[string, DemoRead]> = [
  ['/pacientes', r => patients.getPacientes(query(r))],
  ['/pacientes/:pacienteId', r => patients.getPaciente(r.params.pacienteId)],
  ['/clinicas', () => identity.getClinicas()],
  ['/doctores', () => identity.getDoctores()],
  ['/doctores/:doctorId/horarios', r => scheduling.getHorarios(r.params.doctorId)],
  ['/presupuestos', r => treatmentPlans.getPresupuestos(patientQuery(r) ?? '')],
  ['/presupuestos/trabajo-pendiente/:pacienteId', r => treatmentPlans.getTrabajosPendientesPaciente(r.params.pacienteId, r.query.solo_pendiente !== false)],
  ['/facturas', r => billing.getFacturas(patientQuery(r))],
  ['/facturas/formas-pago', () => billing.getFormasPago()],
  ['/facturas/historial-sin-facturar', r => billing.getHistorialSinFacturar(patientQuery(r) ?? '')],
  ['/pacientes/:pacienteId/saldo', r => billing.getSaldoPaciente(r.params.pacienteId)],
  ['/pacientes/:pacienteId/pagos-anticipados', () => billing.getPagosAnticipadosPaciente()],
  ['/tratamientos/historial/:pacienteId', r => clinical.getHistorialPaciente(r.params.pacienteId)],
  ['/tratamientos/pacientes/:pacienteId/sesion-items', async () => []],
  ['/tratamientos/notas-dentales/:pacienteId', async () => []],
  ['/pacientes/:pacienteId/documentos', r => documents.getDocumentosPaciente(r.params.pacienteId, query<{ categoria?: string }>(r).categoria)],
  ['/consentimientos/plantillas', () => consents.getPlantillasConsentimiento()],
  ['/pacientes/:pacienteId/consentimientos', r => consents.getConsentimientosPaciente(r.params.pacienteId)],
  ['/recetas', () => prescriptions.getRecetasPaciente()],
  ['/recetas/provider-status', () => prescriptions.getRecetaProviderStatus()],
  ['/recetas/plantillas', () => prescriptions.getRecetaPlantillas()],
  ['/citas', r => scheduling.getCitas(query(r))],
  ['/pacientes/:pacienteId/citas', r => scheduling.getPacienteCitas(r.params.pacienteId)],
  ['/citas/buscar-hueco', r => scheduling.buscarHuecosLibres(query(r))],
  ['/citas/disponibilidad', r => scheduling.getDisponibilidadDoctor(query(r))],
  ['/citas/:citaId/cambios', () => scheduling.getCambiosCita()],
  ['/citas/panel/telefonear/pendientes', () => communications.getTelefonear()],
  ['/portal/me', r => portal.getPortalMe(patientQuery(r))],
  ['/portal/citas', r => portal.getPortalCitas(patientQuery(r))],
  ['/portal/documentos', r => portal.getPortalDocumentos(patientQuery(r))],
  ['/portal/consentimientos', r => portal.getPortalConsentimientos(patientQuery(r))],
  ['/whatsapp/comunicaciones', r => communications.getWhatsAppComunicaciones(query(r))],
  ['/notificaciones/mias', () => communications.getMyDoctorNotifications()],
  ['/fichajes/trabajadores', () => workforce.getTrabajadoresFichaje()],
  ['/fichajes/ultimo/:trabajadorId', () => workforce.getUltimoFichajeTrabajador()],
  ['/tratamientos/familias', () => treatmentCatalog.getFamiliasTratamiento()],
  ['/tratamientos', r => treatmentCatalog.getTratamientosCatalogo(query(r))],
  ['/inventario', () => inventory.getInventario()],
  ['/inventario/alertas-stock', () => inventory.getAlertasStock()],
  ['/inventario/:productoId/movimientos', () => inventory.getMovimientosInventario()],
  ['/inventario/proveedores', () => inventory.getProveedoresInventario()],
  ['/inventario/pedidos', () => inventory.getPedidosInventario()],
  ['/reportes/ingresos', () => reporting.getIngresosReporte()],
  ['/reportes/kpis', () => reporting.getReportKpis()],
  ['/reportes/dashboard', () => reporting.getReportDashboard()],
  ['/reportes/pacientes', () => reporting.getReportPacientes()],
  ['/reportes/top-tratamientos', () => reporting.getReportTopTratamientos()],
  ['/reportes/citas-por-doctor', () => reporting.getReportCitasDoctor()],
  ['/admin/backups', () => administration.getBackups()],
  ['/admin/produccion/preflight', () => administration.getProductionReadiness()],
  ['/admin/auditoria', () => administration.getAuditLog()],
  ['/laboratorios', () => laboratory.getLaboratorios()],
  ['/laboratorio/trabajos', r => laboratory.getTrabajosLaboratorio(query(r))],
  ['/laboratorio/citas/:citaId/trabajos', r => laboratory.getTrabajosLaboratorio({ cita_id: r.params.citaId })],
  ['/pacientes/:pacienteId/odontograma', r => odontogram.getOdontogramaPaciente(r.params.pacienteId)],
  ['/pacientes/:pacienteId/odontograma/contexto', r => odontogram.getOdontogramaContexto(r.params.pacienteId, query<{ mode: OdontogramaContextMode }>(r).mode)],
  ['/odontogramas/:odontogramaId/historial', () => odontogram.getOdontogramaHistorial()],
];

function matchRoute(pattern: string, pathname: string) {
  const expected = pattern.split('/');
  const actual = pathname.split('/');
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (expected[i] !== actual[i]) return null;
  }
  return params;
}

function fail(config: InternalAxiosRequestConfig, status: number, detail: string): never {
  throw new AxiosError(detail, 'ERR_DEMO_REQUEST', config, undefined, {
    config, status, statusText: 'Demo request unavailable', data: { detail }, headers: new AxiosHeaders(),
  });
}

export const demoAdapter: AxiosAdapter = async (config) => {
  if (!import.meta.env.DEV) fail(config, 403, 'El adaptador demo solo está disponible en desarrollo.');
  const url = new URL(config.url ?? '/', 'https://dentcore.demo');
  const method = config.method?.toLowerCase() ?? 'get';
  let data: unknown;

  if (method === 'post' && url.pathname === '/auth/login') {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const token = identity.demoLogin(body?.username, body?.password);
    if (!token) fail(config, 401, 'Credenciales demo incorrectas.');
    data = { access_token: token };
  } else if (method === 'post' && url.pathname === '/auth/logout') {
    data = { ok: true };
  } else {
    const user = identity.getDemoUser();
    if (!user) fail(config, 401, 'Inicia una sesión demo para consultar los datos de ejemplo.');
    if (method === 'post' && url.pathname === '/auth/refresh') data = { access_token: getStoredAuthToken() };
    else if (method === 'get' && url.pathname === '/auth/me') data = user;
    else if (method === 'get') {
      const route = reads.map(([pattern, read]) => ({ read, params: matchRoute(pattern, url.pathname) })).find(r => r.params);
      if (!route?.params) fail(config, 501, 'Esta consulta no está disponible en la demo. Conecta la API real.');
      data = await route.read({ params: route.params, query: { ...Object.fromEntries(url.searchParams), ...config.params } });
    } else fail(config, 501, 'Esta acción requiere la API real. La demo no registra cambios clínicos ni económicos.');
  }

  return { config, data, status: 200, statusText: 'OK', headers: new AxiosHeaders() };
};
