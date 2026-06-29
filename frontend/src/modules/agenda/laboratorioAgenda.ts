import type { Cita, TrabajoLaboratorioCitaResumen } from '../../types/api';

export type LabVisualVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface LabStatusMeta {
  label: string;
  shortLabel: string;
  variant: LabVisualVariant;
}

export interface AgendaLabSummary {
  total: number;
  ready: number;
  pending: number;
  delayed: number;
  suspectedWithoutWork: number;
}

const LAB_DEPENDENCY_TERMS = [
  'prueba',
  'probar',
  'colocar',
  'colocacion',
  'entrega',
  'cementado',
  'cementar',
  'ferula',
  'protesis',
  'corona',
  'puente',
  'alineador',
  'alineadores',
  'retenedor',
  'implante',
  'estructura',
  'laboratorio',
  'ajuste',
];

const RECEIVED_STATES = new Set([
  'recibido',
  'recepcionado',
  'received_in_clinic',
  'checked_in_clinic',
  'tried_in_patient',
  'delivered_or_placed',
  'probado',
  'finalizado',
  'entregado',
  'colocado',
  'completado',
]);

const CHECKED_STATES = new Set([
  'checked_in_clinic',
  'tried_in_patient',
  'delivered_or_placed',
  'probado',
  'finalizado',
  'entregado',
  'colocado',
  'completado',
]);

const CANCELLED_STATES = new Set(['cancelado', 'cancelled']);

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeLabStatus(status?: string | null) {
  const key = (status ?? '').toLowerCase();
  const aliases: Record<string, string> = {
    pendiente: 'pending_to_send',
    pendiente_enviar: 'pending_to_send',
    enviado: 'sent_to_lab',
    en_proceso: 'in_progress_at_lab',
    en_fabricacion: 'in_progress_at_lab',
    recibido: 'received_in_clinic',
    probado: 'tried_in_patient',
    finalizado: 'delivered_or_placed',
    entregado: 'delivered_or_placed',
    repetir_corregir: 'remake_required',
    incidencia: 'returned_to_lab',
    cancelado: 'cancelled',
  };
  return aliases[key] ?? key;
}

export function appointmentSuggestsLab(cita: Cita) {
  const text = normalize([cita.motivo, cita.observaciones].filter(Boolean).join(' '));
  if (!text) return false;
  return LAB_DEPENDENCY_TERMS.some((term) => text.includes(normalize(term)));
}

export function isLabReceived(trabajo: TrabajoLaboratorioCitaResumen) {
  return Boolean(trabajo.fecha_recepcion) || RECEIVED_STATES.has(normalizeLabStatus(trabajo.estado));
}

export function isLabChecked(trabajo: TrabajoLaboratorioCitaResumen) {
  return Boolean(trabajo.fecha_revision) || CHECKED_STATES.has(normalizeLabStatus(trabajo.estado));
}

export function isLabReadyForAppointment(trabajo: TrabajoLaboratorioCitaResumen) {
  return isLabReceived(trabajo);
}

export function isLabDelayed(trabajo: TrabajoLaboratorioCitaResumen, today: string) {
  if (!trabajo.fecha_entrega_prevista || isLabReceived(trabajo)) return false;
  if (CANCELLED_STATES.has(normalizeLabStatus(trabajo.estado))) return false;
  return trabajo.fecha_entrega_prevista.slice(0, 10) < today;
}

export function labStatusMeta(trabajo: TrabajoLaboratorioCitaResumen, today: string): LabStatusMeta {
  if (isLabDelayed(trabajo, today) || normalizeLabStatus(trabajo.estado) === 'delayed') {
    return { label: 'Trabajo retrasado', shortLabel: 'Retrasado', variant: 'danger' };
  }
  switch (normalizeLabStatus(trabajo.estado)) {
    case 'pending_to_send':
      return { label: 'Pendiente de enviar', shortLabel: 'Pendiente enviar', variant: 'info' };
    case 'sent_to_lab':
    case 'in_progress_at_lab':
      return { label: 'En laboratorio', shortLabel: 'En laboratorio', variant: 'warning' };
    case 'ready_at_lab':
      return { label: 'Listo en laboratorio', shortLabel: 'Listo en lab', variant: 'warning' };
    case 'received_in_clinic':
      return { label: 'Recibido en clinica', shortLabel: 'Recibido', variant: 'success' };
    case 'checked_in_clinic':
      return { label: 'Revisado en clinica', shortLabel: 'Revisado', variant: 'success' };
    case 'tried_in_patient':
      return { label: 'Probado en paciente', shortLabel: 'Probado', variant: 'success' };
    case 'delivered_or_placed':
      return { label: 'Entregado o colocado', shortLabel: 'Entregado', variant: 'success' };
    case 'returned_to_lab':
      return { label: 'Devuelto al laboratorio', shortLabel: 'Devuelto al lab', variant: 'danger' };
    case 'remake_required':
      return { label: 'Repeticion requerida', shortLabel: 'Repetir', variant: 'danger' };
    case 'cancelled':
      return { label: 'Cancelado', shortLabel: 'Cancelado', variant: 'neutral' };
    default:
      return { label: trabajo.estado || 'Sin estado', shortLabel: trabajo.estado || 'Lab', variant: 'neutral' };
  }
}

export function labShortName(trabajo: TrabajoLaboratorioCitaResumen) {
  const piece = trabajo.pieza_dental ? ` ${trabajo.pieza_dental}` : '';
  const base = trabajo.descripcion || trabajo.tipo_trabajo || 'Trabajo laboratorio';
  return `${base}${base.includes(piece.trim()) ? '' : piece}`.trim();
}

export function buildLabAlerts(cita: Cita, today: string) {
  const trabajos = cita.laboratorio ?? [];
  const alerts: string[] = [];
  if (!trabajos.length && appointmentSuggestsLab(cita)) {
    alerts.push('Esta cita parece depender de laboratorio, pero no hay trabajo asociado.');
    return alerts;
  }
  trabajos.forEach((trabajo) => {
    if (isLabDelayed(trabajo, today)) {
      alerts.push('Trabajo de laboratorio retrasado.');
    }
    if (cita.fecha_hora.slice(0, 10) === today && !isLabReadyForAppointment(trabajo)) {
      alerts.push('Este trabajo todavia no consta como recibido en clinica.');
    }
    if (isLabReceived(trabajo) && !isLabChecked(trabajo)) {
      alerts.push('Recibido en clinica, pendiente de revisar.');
    }
  });
  return Array.from(new Set(alerts));
}

export function citaMatchesLabFilter(cita: Cita) {
  return Boolean(cita.laboratorio?.length) || appointmentSuggestsLab(cita);
}

export function agendaLabSummary(citas: Cita[], today: string): AgendaLabSummary {
  const trabajos = citas.flatMap((cita) => cita.laboratorio ?? []);
  const delayed = trabajos.filter((trabajo) => isLabDelayed(trabajo, today)).length;
  const ready = trabajos.filter((trabajo) => isLabReadyForAppointment(trabajo)).length;
  const suspectedWithoutWork = citas.filter((cita) => !cita.laboratorio?.length && appointmentSuggestsLab(cita)).length;
  return {
    total: trabajos.length,
    ready,
    pending: Math.max(0, trabajos.length - ready - delayed),
    delayed,
    suspectedWithoutWork,
  };
}
