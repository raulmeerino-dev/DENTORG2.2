import type { Cita, EstadoOperativoCita } from '../../../api/types';

export type AppointmentStatusMeta = { label: string; mark: string; className: string };

export const STATUS_META: Record<EstadoOperativoCita, AppointmentStatusMeta> = {
  programada: { label: 'Programada', mark: 'PR', className: 'state-pending' },
  confirmada: { label: 'Confirmada', mark: 'OK', className: 'state-confirmed' },
  en_sala: { label: 'En sala', mark: 'SA', className: 'state-clinic' },
  en_atencion: { label: 'En atención', mark: 'AT', className: 'state-treatment' },
  finalizada: { label: 'Finalizada', mark: 'FIN', className: 'state-done' },
  cancelada: { label: 'Cancelada', mark: 'X', className: 'state-cancelled' },
  no_presentado: { label: 'No presentado', mark: 'NO', className: 'state-missed' },
};

const LEGACY_STATUS: Record<string, EstadoOperativoCita> = {
  programada: 'programada', pending_confirmation: 'programada', reminder_sent: 'programada',
  mensaje_enviado: 'programada', pending_manual_review: 'programada', reschedule_requested: 'programada',
  confirmada: 'confirmada', confirmed: 'confirmada', rescheduled: 'confirmada',
  en_clinica: 'en_sala', en_sala: 'en_sala', en_tratamiento: 'en_atencion', en_atencion: 'en_atencion',
  atendida: 'finalizada', finalizada: 'finalizada', anulada: 'cancelada', cancelled_by_patient: 'cancelada',
  cancelada: 'cancelada', falta: 'no_presentado', no_presentado: 'no_presentado',
};

export type QuickAppointmentStateKey = EstadoOperativoCita;
export type QuickAppointmentState = { key: QuickAppointmentStateKey; value: string; label: string; className: string };
export const AGENDA_STATUS_LEGEND = Object.keys(STATUS_META) as EstadoOperativoCita[];
export const QUICK_APPOINTMENT_STATES: QuickAppointmentState[] = AGENDA_STATUS_LEGEND.map(key => ({
  key, value: key, ...STATUS_META[key],
}));

export function getVisualStatus(cita: Pick<Cita, 'estado' | 'estado_operativo' | 'observaciones'>): EstadoOperativoCita {
  if (cita.estado_operativo) return cita.estado_operativo;
  // Compatibility for historical notes only; new transitions use dedicated audited endpoints.
  if (cita.estado === 'en_clinica' && cita.observaciones?.split('\n').some(line => line.trim().toLowerCase() === 'en tratamiento')) return 'en_atencion';
  return LEGACY_STATUS[cita.estado] ?? 'programada';
}

export function quickAppointmentStateKey(estado: string, observaciones = ''): QuickAppointmentStateKey {
  return getVisualStatus({ estado, observaciones });
}

export function appointmentFlags(cita: Cita): string[] {
  const flags: string[] = [];
  if (cita.recordatorio_enviado || ['reminder_sent', 'mensaje_enviado'].includes(cita.estado)) flags.push('Recordatorio enviado');
  if (cita.estado === 'reschedule_requested') flags.push('Solicita cambio');
  if (cita.estado === 'pending_manual_review') flags.push('Revisar respuesta');
  if (cita.estado === 'rescheduled') flags.push('Reprogramada');
  if (cita.pendiente_salida) flags.push('Pendiente de salida');
  return flags;
}

export function statusMetaForCita(cita: Cita) {
  return STATUS_META[getVisualStatus(cita)];
}
