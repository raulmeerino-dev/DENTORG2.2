import type { CopilotContext } from '../../../api/copilot';
const modules = new Set(['jornada', 'agenda', 'pacientes', 'caja', 'registros', 'archivos', 'administracion', 'ajustes']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Use the visible route, never a patient remembered in another module. */
export function copilotContext(pathname: string, search: string): CopilotContext {
  const route = pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(search);
  const module = (modules.has(route[0]) ? route[0] : 'otro') as CopilotContext['module'];
  const context: CopilotContext = { module: module === 'jornada' && query.get('vista') === 'agenda' ? 'agenda' : module };
  if (module === 'pacientes') {
    const patient = query.get('paciente_id') || route[1];
    if (patient && uuid.test(patient)) context.patient_id = patient;
    context.section = query.get('tab')?.slice(0, 40) || 'ficha';
  }
  if (['pacientes', 'agenda', 'jornada'].includes(module)) {
    const appointment = query.get('cita_id');
    if (appointment && uuid.test(appointment)) context.appointment_id = appointment;
    const day = query.get('fecha');
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) context.day = day;
  }
  return context;
}
