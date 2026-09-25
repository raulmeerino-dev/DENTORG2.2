import type { Cita,Doctor,HorarioDoctor } from '../../../api/types';
import type { HorariosPorDoctor } from './agendaTypes';
import { clinicDate, clinicDateTimeToIso, clinicTime, getClinicTimeZone } from '../../../shared/time/clinicTime';

export function todayIso() {
  return clinicDate(new Date());
}

export function monthGrid(day: string) {
  const current = new Date(`${day}T12:00:00`);
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const start = new Date(first);
  const offset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - offset);
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const length = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIso(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function slotIso(day: string, slot: string) {
  return clinicDateTimeToIso(day, slot);
}

export function localAppointmentDate(value: string) { return clinicDate(value); }
export function localAppointmentTime(value: string) {
  return clinicTime(value);
}

export function localDayRange(day: string) {
  const nextDay = addDaysIso(day, 1);
  const end = new Date(Date.parse(clinicDateTimeToIso(nextDay)) - 1);
  return { fecha_desde: clinicDateTimeToIso(day), fecha_hasta: end.toISOString() };
}

export function nowLocalDateTimeIso() {
  const now = new Date();
  return `${clinicDate(now)}T${clinicTime(now)}:00`;
}

export function minutesFromTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString('es-ES', {
    timeZone: getClinicTimeZone(),
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateLabel(value?: string | null) {
  if (!value) return '-';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function dateRangeIso(from: string, days: number) {
  return Array.from({ length: Math.max(1, days) }, (_, index) => addDaysIso(from, index));
}

export function overlaps(start: string, duration: number, cita: Cita) {
  const slotStart = new Date(start).getTime();
  const slotEnd = slotStart + duration * 60_000;
  const citaStart = new Date(cita.fecha_hora).getTime();
  const citaEnd = citaStart + cita.duracion_min * 60_000;
  return slotStart < citaEnd && slotEnd > citaStart;
}

export function weekdayIndex(day: string) {
  return (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
}

function slotRange(inicio: string, fin: string, intervalo: number) {
  const slots: string[] = [];
  let current = minutesFromTime(inicio);
  const end = minutesFromTime(fin);
  const step = Math.max(5, intervalo || 10);
  while (current < end) {
    const hour = Math.floor(current / 60);
    const minute = current % 60;
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    current += step;
  }
  return slots;
}

export function slotInHorario(slot: string, horario?: HorarioDoctor) {
  if (!horario || horario.tipo_dia === 'festivo') return false;
  return horario.bloques.some((bloque) => bloque.inicio <= slot && slot < bloque.fin);
}

export function buildAgendaSlots({
  day,
  doctorId,
  doctores,
  horariosByDoctor,
  citas,
}: {
  day: string;
  doctorId: string;
  doctores: Doctor[];
  horariosByDoctor: HorariosPorDoctor;
  citas: Cita[];
}) {
  const weekday = weekdayIndex(day);
  const targetDoctorIds = doctorId ? [doctorId] : doctores.map((doctor) => doctor.id);
  const times = new Set<string>();

  targetDoctorIds.forEach((targetDoctorId) => {
    const horario = horariosByDoctor[targetDoctorId]?.find((item) => item.dia_semana === weekday);
    if (!horario) return;
    if (horario.tipo_dia === 'festivo') return;
    horario.bloques.forEach((bloque) => {
      slotRange(bloque.inicio, bloque.fin, horario.intervalo_min).forEach((slot) => times.add(slot));
    });
  });

  citas.forEach((cita) => {
    if (!doctorId || cita.doctor_id === doctorId) times.add(localAppointmentTime(cita.fecha_hora));
  });

  return Array.from(times).sort((a, b) => minutesFromTime(a) - minutesFromTime(b));
}
