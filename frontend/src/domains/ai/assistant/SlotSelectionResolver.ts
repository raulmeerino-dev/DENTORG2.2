import { ASSISTANT_WEEKDAYS } from './DateResolver';
import { resolveTimePreference } from './TimePreferenceResolver';
import { normalizeAssistantText } from './textUtils';
import type { AssistantSlot } from './types';

const ORDINALS: Record<string, number> = {
  primero: 0,
  primera: 0,
  uno: 0,
  segundo: 1,
  segunda: 1,
  dos: 1,
  tercero: 2,
  tercera: 2,
  tres: 2,
  cuarto: 3,
  cuarta: 3,
  cuatro: 3,
  quinto: 4,
  quinta: 4,
  cinco: 4,
};

const WEEKDAY_BY_INDEX = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function slotWeekday(slot: AssistantSlot) {
  if (!slot.fechaHora) return null;
  const date = new Date(slot.fechaHora);
  return WEEKDAY_BY_INDEX[date.getDay()] ?? null;
}

function slotTime(slot: AssistantSlot) {
  return slot.fechaHora?.slice(11, 16) ?? null;
}

export function resolveSlotSelection(text: string, slots: AssistantSlot[] | undefined) {
  if (!slots?.length) return null;
  const normalized = normalizeAssistantText(text);

  const ordinalKey = Object.keys(ORDINALS).find((key) => new RegExp(`\\b(?:el|la)?\\s*${key}\\b`).test(normalized));
  if (ordinalKey) return slots[ORDINALS[ordinalKey]] ?? null;

  const time = resolveTimePreference(text).preferredTime;
  const weekday = ASSISTANT_WEEKDAYS.find((day) => normalized.includes(day)) ?? null;
  const professionalTokens = normalized
    .replace(/\b(el|la|los|las|de|del|con|a|las|por|mejor|hueco|cita|primero|segundo|tercero|cuarto|quinto)\b/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2 && !(ASSISTANT_WEEKDAYS as readonly string[]).includes(token));

  const filtered = slots.filter((slot) => {
    if (time && slotTime(slot) !== time) return false;
    if (weekday && slotWeekday(slot) !== weekday) return false;
    if (professionalTokens.length && slot.doctorName) {
      const doctor = normalizeAssistantText(slot.doctorName);
      return professionalTokens.some((token) => doctor.includes(token));
    }
    return true;
  });

  return filtered[0] ?? null;
}
