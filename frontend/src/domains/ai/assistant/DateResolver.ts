import { hasAvailabilityRequest, normalizeAssistantText } from './textUtils';
import type { AssistantIntentFields } from './types';

export const ASSISTANT_WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function todayAtNoon() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

function addDays(days: number) {
  const date = todayAtNoon();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function addMonths(months: number) {
  const date = todayAtNoon();
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function endOfMonth() {
  const date = todayAtNoon();
  return isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0));
}

export function resolveDateFields(text: string): AssistantIntentFields {
  const normalized = normalizeAssistantText(text);
  const weekday = ASSISTANT_WEEKDAYS.find((day) => normalized.includes(day)) ?? null;
  const hasMorningTimePreference = /\b(por la manana|de manana|manana temprano)\b/.test(normalized);

  if (/\b(seis meses|6 meses)\b/.test(normalized)) {
    return { dateRange: 'in_six_months', preferredDate: addMonths(6), datePreference: weekday };
  }

  if (/\b(tres meses|3 meses)\b/.test(normalized)) {
    return { dateRange: 'in_three_months', preferredDate: addMonths(3), datePreference: weekday };
  }

  if (/\b(dentro de dos semanas|dentro de 2 semanas|en dos semanas|en 2 semanas)\b/.test(normalized)) {
    return { dateRange: 'in_two_weeks', preferredDate: addDays(14), datePreference: weekday };
  }

  if (/\b(final de mes|fin de mes|a final de mes|a fin de mes)\b/.test(normalized)) {
    return { dateRange: 'end_of_month', preferredDate: endOfMonth(), datePreference: weekday };
  }

  if (/\b(semana que viene|proxima semana)\b/.test(normalized)) {
    return { dateRange: 'next_week', datePreference: weekday };
  }

  if (/\b(pasado manana)\b/.test(normalized)) {
    return { dateRange: 'after_tomorrow', preferredDate: addDays(2), datePreference: weekday };
  }

  if (/\bmanana\b/.test(normalized) && !hasMorningTimePreference) {
    return { dateRange: 'tomorrow', preferredDate: addDays(1), datePreference: weekday };
  }

  if (/\bhoy\b/.test(normalized)) {
    return { dateRange: 'today', preferredDate: addDays(0), datePreference: weekday };
  }

  if (weekday) {
    return { datePreference: weekday };
  }

  if (hasAvailabilityRequest(text)) {
    return { dateRange: 'next_available' };
  }

  return {};
}
