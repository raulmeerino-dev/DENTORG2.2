import type { Cita } from '../../../api/types';
import { overlaps } from './agendaTime';
import { getVisualStatus } from './appointmentStatus';

export function appointmentConflicts(cita: Cita, citas: Cita[]) {
  if (['cancelada', 'no_presentado'].includes(getVisualStatus(cita))) return [];
  return citas.filter(other => other.id !== cita.id
    && !['cancelada', 'no_presentado'].includes(getVisualStatus(other))
    && (other.doctor_id === cita.doctor_id || Boolean(cita.gabinete_id && other.gabinete_id === cita.gabinete_id))
    && overlaps(cita.fecha_hora, cita.duracion_min, other));
}

function positiveMinutes(milliseconds: number) { return Math.max(0, Math.floor(milliseconds / 60_000)); }

export function appointmentTiming(cita: Cita, now: Date, citas: Cita[] = []) {
  const planned = new Date(cita.fecha_hora).getTime();
  const arrival = cita.llegada_at ? new Date(cita.llegada_at).getTime() : null;
  const started = cita.atencion_iniciada_at ? new Date(cita.atencion_iniciada_at).getTime() : planned;
  const status = getVisualStatus(cita);
  const arrivalDelay = arrival ? positiveMinutes(arrival - planned) : 0;
  const overtime = status === 'en_atencion' ? positiveMinutes(now.getTime() - started - cita.duracion_min * 60_000) : 0;
  const earlierSessions = ['programada', 'confirmada', 'en_sala'].includes(status) ? citas.filter(other =>
    other.id !== cita.id && other.doctor_id === cita.doctor_id && getVisualStatus(other) === 'en_atencion'
    && new Date(other.fecha_hora).getTime() <= planned,
  ) : [];
  const estimatedRelease = earlierSessions.reduce((latest, other) => Math.max(latest, now.getTime(),
    new Date(other.atencion_iniciada_at ?? other.fecha_hora).getTime() + other.duracion_min * 60_000), planned);
  const estimatedDelay = positiveMinutes(estimatedRelease - planned);
  return { arrivalDelay, overtime, estimatedDelay };
}
