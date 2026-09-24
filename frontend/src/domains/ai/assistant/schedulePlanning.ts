import type { AssistantIntentFields, AssistantSlot } from './types';

const WEEKDAY_INDEX: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 0,
};

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function todayIso() {
  return isoDate(new Date());
}

function addDaysIso(days: number) {
  const date = new Date(`${todayIso()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function addMonthsIso(months: number) {
  const date = new Date(`${todayIso()}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function endOfMonthIso() {
  const date = new Date(`${todayIso()}T12:00:00`);
  return isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0));
}

function nextWeekStartDate() {
  const date = new Date(`${todayIso()}T12:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + (7 - day));
  return date;
}

function nextWeekdayIso(weekdayName: string, fromNextWeek: boolean) {
  const target = WEEKDAY_INDEX[weekdayName];
  if (target == null) return null;
  const base = fromNextWeek ? nextWeekStartDate() : new Date(`${todayIso()}T12:00:00`);
  const current = base.getDay();
  let delta = (target - current + 7) % 7;
  if (!fromNextWeek && delta === 0) delta = 7;
  base.setDate(base.getDate() + delta);
  return isoDate(base);
}

export function preferredDateFromFields(fields: AssistantIntentFields) {
  if (fields.preferredDate) return fields.preferredDate;
  if (fields.datePreference) {
    return nextWeekdayIso(fields.datePreference, fields.dateRange === 'next_week');
  }
  if (fields.dateRange === 'today') return todayIso();
  if (fields.dateRange === 'tomorrow') return addDaysIso(1);
  if (fields.dateRange === 'after_tomorrow') return addDaysIso(2);
  if (fields.dateRange === 'next_week') return isoDate(nextWeekStartDate());
  if (fields.dateRange === 'in_six_months') return addMonthsIso(6);
  if (fields.dateRange === 'in_two_weeks') return addDaysIso(14);
  if (fields.dateRange === 'end_of_month') return endOfMonthIso();
  if (fields.dateRange === 'next_available') return todayIso();
  return null;
}

export function dateRangeEndFromFields(fields: AssistantIntentFields) {
  const start = preferredDateFromFields(fields);
  if (!start) return null;
  if (fields.dateRange === 'next_week' && !fields.datePreference) return addDaysToDate(start, 6);
  if (fields.dateRange === 'next_available') return addDaysToDate(start, 21);
  return start;
}

export function addDaysToDate(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function normalizePreferredTime(value?: string | null) {
  if (!value) return null;
  const numeric = value.match(/\b(\d{1,2})(?::|\.|h)?(\d{2})?\b/);
  if (!numeric) return null;
  const hour = Number(numeric[1]);
  const minute = Number(numeric[2] ?? 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function slotLabel(slot: AssistantSlot) {
  const start = slot.fechaHora?.slice(0, 16).replace('T', ' ');
  const doctor = slot.doctorName ? ` · ${slot.doctorName}` : '';
  return start ? `${start}${doctor}` : slot.label ?? 'Hueco sugerido';
}

export function appointmentDateTimeFromFields(fields: AssistantIntentFields) {
  if (fields.slot?.fechaHora) return fields.slot.fechaHora;
  const day = preferredDateFromFields(fields);
  const time = normalizePreferredTime(fields.preferredTime) ?? '09:00';
  return day ? `${day}T${time}:00` : null;
}
