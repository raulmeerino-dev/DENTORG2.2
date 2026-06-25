import { clearWinner, rankOptions } from './entityResolverUtils';
import { extractStructuredEntityPhrase } from './EntityPhraseParser';
import { cleanCapturedPhrase, cleanEntityText, normalizeAssistantText, titleCaseName } from './textUtils';
import type { AssistantContextSnapshot, AssistantIntentFields, AssistantProfessionalOption } from './types';

function normalizeProfessionalText(value: string) {
  return normalizeAssistantText(value)
    .replace(/\b(?:cinthia|cynthia|cyntia|sinthia|sintia|zintia)\b/g, 'cintia')
    .replace(/\by\b/g, 'i');
}

function professionalSearchText(option: AssistantProfessionalOption) {
  return [
    option.displayName,
    option.specialty,
  ].filter(Boolean).join(' ');
}

export function findProfessionalCandidates(query: string | null | undefined, professionals: AssistantProfessionalOption[]) {
  return rankOptions(query, professionals, professionalSearchText, normalizeProfessionalText).slice(0, 6).map((item) => item.option);
}

export function findMentionedProfessional(text: string, professionals: AssistantProfessionalOption[]) {
  const normalized = normalizeProfessionalText(text);
  return professionals
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .find((option) => normalizeProfessionalText(option.displayName).split(' ').every((token) => normalized.includes(token))) ?? null;
}

export function resolveProfessionalFields(query: string | null, professionals: AssistantProfessionalOption[]): AssistantIntentFields {
  if (!query) return {};
  const cleanedQuery = cleanEntityText(query);
  const ranked = rankOptions(cleanedQuery, professionals, professionalSearchText, normalizeProfessionalText);
  const winner = clearWinner(ranked);
  if (winner) {
    return {
      professional: winner.displayName,
      professionalId: winner.id,
      professionalQuery: cleanedQuery,
      professionalOptions: [],
    };
  }

  return {
    professional: titleCaseName(cleanedQuery),
    professionalId: null,
    professionalQuery: cleanedQuery,
    professionalOptions: ranked.slice(0, 6).map((item) => item.option),
  };
}

export function defaultProfessionalFromContext(context: AssistantContextSnapshot, professionals: AssistantProfessionalOption[]): AssistantIntentFields {
  if (!context.currentDoctorId) return {};
  const professional = professionals.find((item) => item.id === context.currentDoctorId);
  return professional ? resolveProfessionalFields(professional.displayName, professionals) : {};
}

export function extractProfessionalFields(text: string, professionals: AssistantProfessionalOption[]): AssistantIntentFields {
  const structured = extractStructuredEntityPhrase(text);
  if (structured.professionalQuery) return resolveProfessionalFields(structured.professionalQuery, professionals);

  const mentioned = findMentionedProfessional(text, professionals);
  const normalized = normalizeAssistantText(text);
  const replacementMatch = normalized.match(/\b(?:cambia|cambiar|sustituye|sustituir)\s+[a-z0-9 ]+?\s+por\s+([a-z0-9 ]+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|para|en|mejor|semana|jueves|viernes|lunes|martes|miercoles|sabado|domingo|a\s+las|por\s+la)\b|$)/);
  if (replacementMatch?.[1]) return resolveProfessionalFields(replacementMatch[1], professionals);

  const titledMatch = normalized.match(/\bcon\s+(?:el\s+|la\s+)?(?:doctor|doctora|profesional)\s+([a-z0-9 ]+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|para|en|mejor|semana|jueves|viernes|lunes|martes|miercoles|sabado|domingo|a\s+las|por\s+la)\b|$)/);
  if (titledMatch?.[1]) return resolveProfessionalFields(titledMatch[1], professionals);

  const explicitMatch = normalized.match(/\b(?:con|doctor|doctora|profesional)\s+(?:es\s+)?([a-z0-9 ]+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|para|en|mejor|semana|jueves|viernes|lunes|martes|miercoles|sabado|domingo|a\s+las|por\s+la)\b|$)/);
  if (explicitMatch?.[1]) return resolveProfessionalFields(explicitMatch[1], professionals);

  if (mentioned) return resolveProfessionalFields(mentioned.displayName, professionals);

  const match = normalized.match(/\bcon\s+([a-z0-9 ]+?)(?:\s+(?:dime|mira|busca|que\s+opciones|que\s+huecos|que\s+disponibilidad|el|la|los|las|para|en|mejor|semana|jueves|viernes|lunes|martes|miercoles|sabado|domingo|a\s+las|por\s+la)\b|$)/);
  const value = cleanEntityText(cleanCapturedPhrase(match?.[1] ?? ''));
  if (!value || ['limpieza', 'revision', 'cita'].includes(value)) return {};
  return resolveProfessionalFields(value, professionals);
}
