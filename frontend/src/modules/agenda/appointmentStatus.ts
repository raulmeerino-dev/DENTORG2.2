import type { Cita } from '../../types/api';

export type AppointmentStatusMeta = {
  label: string;
  mark: string;
  className: string;
};

export const STATUS_META: Record<string, AppointmentStatusMeta> = {
  programada: { label: 'Sin confirmar', mark: '?', className: 'state-pending' },
  pending_confirmation: { label: 'Sin confirmar', mark: '?', className: 'state-pending' },
  mensaje_enviado: { label: 'Mensaje enviado', mark: 'MSG', className: 'state-message' },
  reminder_sent: { label: 'Mensaje enviado', mark: 'MSG', className: 'state-message' },
  confirmada: { label: 'Confirmada', mark: 'OK', className: 'state-confirmed' },
  confirmed: { label: 'Confirmada', mark: 'OK', className: 'state-confirmed' },
  reschedule_requested: { label: 'Solicita cambio', mark: 'REP', className: 'state-message' },
  pending_manual_review: { label: 'Revisar', mark: 'REV', className: 'state-pending' },
  cancelled_by_patient: { label: 'Cancelada paciente', mark: 'X', className: 'state-cancelled' },
  rescheduled: { label: 'Reprogramada', mark: 'REP', className: 'state-confirmed' },
  en_clinica: { label: 'En clinica', mark: 'IN', className: 'state-clinic' },
  en_tratamiento: { label: 'En tratamiento', mark: 'TR', className: 'state-treatment' },
  atendida: { label: 'Finalizada', mark: 'FIN', className: 'state-done' },
  anulada: { label: 'Cancelada', mark: 'X', className: 'state-cancelled' },
  falta: { label: 'No asistio', mark: 'NO', className: 'state-missed' },
};

export type QuickAppointmentStateKey = 'programada' | 'confirmada' | 'en_clinica' | 'en_tratamiento' | 'atendida' | 'anulada' | 'falta';

export type QuickAppointmentState = {
  key: QuickAppointmentStateKey;
  value: string;
  label: string;
  className: string;
  aliases?: string[];
};

export const QUICK_APPOINTMENT_STATES: QuickAppointmentState[] = [
  {
    key: 'programada',
    value: 'programada',
    label: 'Sin confirmar',
    className: 'state-pending',
    aliases: ['programada', 'pending_confirmation', 'reminder_sent', 'pending_manual_review'],
  },
  {
    key: 'confirmada',
    value: 'confirmada',
    label: 'Confirmada',
    className: 'state-confirmed',
    aliases: ['confirmada', 'confirmed', 'rescheduled'],
  },
  { key: 'en_clinica', value: 'en_clinica', label: 'En clinica', className: 'state-clinic' },
  { key: 'en_tratamiento', value: 'en_clinica', label: 'En tratamiento', className: 'state-treatment' },
  { key: 'atendida', value: 'atendida', label: 'Finalizada', className: 'state-done' },
  {
    key: 'anulada',
    value: 'anulada',
    label: 'Cancelada',
    className: 'state-cancelled',
    aliases: ['anulada', 'cancelled_by_patient'],
  },
  { key: 'falta', value: 'falta', label: 'No asistio', className: 'state-missed' },
];

export const AGENDA_STATUS_LEGEND = [
  'programada',
  'mensaje_enviado',
  'confirmada',
  'reschedule_requested',
  'pending_manual_review',
  'cancelled_by_patient',
  'rescheduled',
  'en_clinica',
  'en_tratamiento',
  'atendida',
  'anulada',
  'falta',
] as const;

export function hasTreatmentMarker(value: string) {
  return value.toLowerCase().split('\n').some((line) => line.trim() === 'en tratamiento');
}

export function setTreatmentMarker(value: string, enabled: boolean) {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== 'en tratamiento');
  if (enabled) lines.push('En tratamiento');
  return lines.join('\n');
}

export function getVisualStatus(cita: Cita) {
  const obs = cita.observaciones?.toLowerCase() ?? '';
  if (['programada', 'pending_confirmation'].includes(cita.estado) && cita.recordatorio_enviado) return 'mensaje_enviado';
  if (['programada', 'pending_confirmation'].includes(cita.estado) && obs.includes('recordatorio')) return 'mensaje_enviado';
  if (cita.estado === 'en_clinica' && obs.includes('en tratamiento')) return 'en_tratamiento';
  return cita.estado;
}

export function quickAppointmentStateKey(estado: string, observaciones: string): QuickAppointmentStateKey | null {
  if (estado === 'en_clinica' && hasTreatmentMarker(observaciones)) return 'en_tratamiento';
  const option = QUICK_APPOINTMENT_STATES.find((item) => (item.aliases ?? [item.value]).includes(estado));
  return option?.key ?? null;
}

export function statusMetaForCita(cita: Cita) {
  return STATUS_META[getVisualStatus(cita)] ?? STATUS_META.programada;
}
