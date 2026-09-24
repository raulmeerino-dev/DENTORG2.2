import type { Cita } from '../../../api/types';

export function elapsedMinutes(timestamp: string | null | undefined, now = Date.now()) {
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 60_000)) : null;
}

export function appointmentTiming(cita: Cita, now = Date.now()) {
  const expected = Date.parse(cita.fecha_hora);
  const arrived = cita.llegada_at ? Date.parse(cita.llegada_at) : null;
  const lateMinutes = arrived !== null && Number.isFinite(expected) ? Math.max(0, Math.floor((arrived - expected) / 60_000)) : 0;
  const waitingMinutes = elapsedMinutes(cita.llegada_at, cita.atencion_iniciada_at ? Date.parse(cita.atencion_iniciada_at) : now);
  const attentionMinutes = elapsedMinutes(cita.atencion_iniciada_at, cita.finalizada_at ? Date.parse(cita.finalizada_at) : now);
  return { lateMinutes, waitingMinutes, overtimeMinutes: Math.max(0, (attentionMinutes ?? 0) - cita.duracion_min) };
}
