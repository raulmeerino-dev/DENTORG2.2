import { buscarHuecosLibres, getCitas } from '../../lib/api';
import type { Cita } from '../../types/api';
import type { AssistantContextSnapshot, AssistantIntent, AssistantSlot } from './types';
import { dateRangeEndFromFields, normalizePreferredTime, preferredDateFromFields, todayIso } from './schedulePlanning';

export async function getAssistantTodaySchedule() {
  const day = todayIso();
  return getAssistantScheduleByDate(day);
}

export async function getAssistantScheduleByDate(day: string, doctorId?: string | null) {
  const params: Record<string, string> = {
    fecha_desde: `${day}T00:00:00`,
    fecha_hasta: `${day}T23:59:59`,
  };
  if (doctorId) params.doctor_id = doctorId;
  return getCitas(params);
}

export async function getAssistantPatientAppointments(patientId: string) {
  return getCitas({ paciente_id: patientId });
}

export function summarizeSchedule(citas: Cita[]) {
  const active = citas.filter((cita) => !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado));
  const pending = active.filter((cita) => ['programada', 'pending_confirmation', 'reminder_sent', 'pending_manual_review'].includes(cita.estado));
  return {
    total: active.length,
    pending: pending.length,
    next: active.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null,
  };
}

export async function findAvailableSlotsForIntent(intent: AssistantIntent): Promise<AssistantSlot[]> {
  const doctorId = intent.fields.professionalId;
  if (!doctorId) return [];
  const start = preferredDateFromFields(intent.fields) ?? todayIso();
  const end = dateRangeEndFromFields(intent.fields) ?? start;
  const slots = await buscarHuecosLibres({
    doctor_id: doctorId,
    duracion_min: intent.fields.durationMinutes ?? 30,
    desde: `${start}T00:00:00`,
    hasta: `${end}T23:59:59`,
    solo_manana: intent.fields.timePreference === 'morning' ? true : undefined,
    solo_tarde: intent.fields.timePreference === 'afternoon' ? true : undefined,
    max_resultados: 8,
  });
  const preferredTime = normalizePreferredTime(intent.fields.preferredTime);
  const mapped = slots.map((slot) => ({
    fechaHora: slot.fecha_hora_inicio,
    doctorId: slot.doctor_id,
    doctorName: intent.fields.professional ?? intent.fields.professionalQuery ?? null,
    durationMinutes: slot.duracion_min,
    label: `${slot.fecha_hora_inicio.slice(0, 16).replace('T', ' ')} - ${intent.fields.professional ?? 'profesional'}`,
  }));
  const filtered = preferredTime
    ? mapped.sort((a, b) => Math.abs(minutesFromSlot(a) - minutesFromTime(preferredTime)) - Math.abs(minutesFromSlot(b) - minutesFromTime(preferredTime)))
    : mapped;

  if (intent.fields.timePreference === 'last_available') {
    return [...filtered].sort((a, b) => (b.fechaHora ?? '').localeCompare(a.fechaHora ?? '')).slice(0, 5);
  }

  if (preferredTime) return filtered.slice(0, 5);

  return [...filtered].sort((a, b) => (a.fechaHora ?? '').localeCompare(b.fechaHora ?? '')).slice(0, 5);
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesFromSlot(slot: AssistantSlot) {
  const time = slot.fechaHora?.slice(11, 16);
  return time ? minutesFromTime(time) : 0;
}

export async function findVisibleAppointmentForIntent(intent: AssistantIntent, context: AssistantContextSnapshot) {
  const day = preferredDateFromFields(intent.fields) ?? context.visibleAgendaDate ?? todayIso();
  const citas = await getAssistantScheduleByDate(day, intent.fields.professionalId);
  const active = citas.filter((cita) => !['anulada', 'falta', 'cancelled_by_patient', 'atendida'].includes(cita.estado));
  const preferredTime = normalizePreferredTime(intent.fields.preferredTime);
  const matches = preferredTime
    ? active.filter((cita) => cita.fecha_hora.slice(11, 16) === preferredTime)
    : active;
  return { day, matches };
}
