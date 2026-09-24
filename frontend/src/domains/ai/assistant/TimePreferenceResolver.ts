import { normalizeAssistantText } from './textUtils';
import type { AssistantIntentFields, AssistantTimePreference } from './types';

const NUMBER_WORDS: Record<string, number> = {
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

function normalizeHour(hour: number, text: string) {
  const normalized = normalizeAssistantText(text);
  if (hour >= 1 && hour <= 7 && !normalized.includes('manana')) return hour + 12;
  if (hour >= 1 && hour <= 11 && normalized.includes('tarde')) return hour + 12;
  return hour;
}

function parseNumericTime(text: string) {
  const normalized = normalizeAssistantText(text);
  const match = normalized.match(/\b(?:a\s+las|sobre\s+las|a|de\s+las|las)\s+(\d{1,2})(?::|\.|h)?(\d{2})?\b/);
  if (!match) return null;
  const hour = normalizeHour(Number(match[1]), normalized);
  const minute = Number(match[2] ?? 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseWordTime(text: string) {
  const normalized = normalizeAssistantText(text);
  const match = normalized.match(/\b(?:a\s+las|sobre\s+las|a|de\s+las|las)\s+(una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/);
  if (!match) return null;
  const rawHour = NUMBER_WORDS[match[1]];
  const hour = normalizeHour(rawHour, normalized);
  return `${String(hour).padStart(2, '0')}:00`;
}

export function resolveTimePreference(text: string): AssistantIntentFields {
  const normalized = normalizeAssistantText(text);
  const preferredTime = parseNumericTime(text) ?? parseWordTime(text);
  let timePreference: AssistantTimePreference | null = null;

  if (/\b(primera hora|primer hueco|primera disponible|lo primero|a primera hora)\b/.test(normalized)) {
    timePreference = 'first_available';
  } else if (/\b(ultima hora|ultimo hueco|ultima disponible|final del dia|a ultima hora)\b/.test(normalized)) {
    timePreference = 'last_available';
  } else if (/\b(por la manana|de manana|manana temprano)\b/.test(normalized)) {
    timePreference = 'morning';
  } else if (/\b(por la tarde|de tarde|tarde)\b/.test(normalized)) {
    timePreference = 'afternoon';
  }

  return {
    ...(preferredTime ? { preferredTime } : {}),
    ...(timePreference ? { timePreference } : {}),
  };
}
