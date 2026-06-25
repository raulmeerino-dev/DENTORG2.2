import { clearWinner, rankOptions } from './entityResolverUtils';
import { extractStructuredEntityPhrase } from './EntityPhraseParser';
import { cleanCapturedPhrase, cleanEntityText, normalizeAssistantText } from './textUtils';
import type { AssistantIntentFields, AssistantTreatmentOption } from './types';

export const TREATMENT_ALIASES = [
  { label: 'limpieza', keys: ['limpieza', 'higiene', 'profilaxis'], durationMinutes: 30 },
  { label: 'revision', keys: ['revision', 'revisar', 'consulta', 'primera visita'], durationMinutes: 20 },
  { label: 'ortodoncia', keys: ['ortodoncia', 'brackets', 'alineadores'], durationMinutes: 40 },
  { label: 'implante', keys: ['implante', 'implantologia'], durationMinutes: 60 },
  { label: 'corona', keys: ['corona', 'funda'], durationMinutes: 50 },
  { label: 'reconstruccion', keys: ['reconstruccion', 'reconstrucciones'], durationMinutes: 40 },
  { label: 'obturacion', keys: ['empaste', 'empastes', 'obturacion', 'obturaciones', 'composite'], durationMinutes: 30 },
  { label: 'endodoncia', keys: ['endodoncia'], durationMinutes: 60 },
  { label: 'extraccion', keys: ['extraccion', 'sacar muela', 'quitar muela'], durationMinutes: 40 },
  { label: 'blanqueamiento', keys: ['blanqueamiento'], durationMinutes: 45 },
  { label: 'periodoncia', keys: ['periodoncia', 'curetaje'], durationMinutes: 45 },
];

function treatmentSearchText(option: AssistantTreatmentOption) {
  return [
    option.displayName,
    option.code,
    option.familyName,
  ].filter(Boolean).join(' ');
}

function aliasForText(text: string) {
  const normalized = normalizeAssistantText(text);
  for (const item of TREATMENT_ALIASES) {
    const key = [...item.keys]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => normalized.includes(normalizeAssistantText(candidate)));
    if (key) return { ...item, matchedKey: normalizeAssistantText(key) };
  }
  return null;
}

function durationFor(value: string | null | undefined) {
  const alias = aliasForText(value ?? '');
  return alias?.durationMinutes ?? 30;
}

export function extractTreatmentQuery(text: string) {
  const structured = extractStructuredEntityPhrase(text);
  if (structured.treatmentType) return structured.treatmentType;

  const normalized = normalizeAssistantText(text);
  const correctionMatch = normalized.match(/\b(?:no\s+es\s+[a-z0-9 ]+?\s+es|(?:el\s+)?tratamiento\s+(?:es|seria|sera))\s+([a-z0-9 ]+?)(?:\s+(?:con|el|la|semana|hoy|manana|pasado|a\s+las|por\s+la|en\s+seis|en\s+tres|dentro|final)\b|$)/);
  if (correctionMatch?.[1]) return cleanEntityText(cleanCapturedPhrase(correctionMatch[1]));

  const alias = aliasForText(text);
  if (alias) return alias.matchedKey;

  const match = normalized.match(/\bpara\s+([a-z0-9 ]+?)(?:\s+(?:con|el|la|semana|hoy|manana|pasado|a\s+las|por\s+la|en\s+seis|en\s+tres|dentro|final)\b|$)/);
  const value = cleanEntityText(cleanCapturedPhrase(match?.[1] ?? ''));
  return value || null;
}

export function resolveTreatmentFields(text: string, treatments: AssistantTreatmentOption[]): AssistantIntentFields {
  const query = extractTreatmentQuery(text);
  if (!query) return {};

  const cleanedQuery = cleanEntityText(query);
  const alias = aliasForText(cleanedQuery);
  const ranked = rankOptions(cleanedQuery, treatments, treatmentSearchText);
  const aliasRanked = alias && alias.label !== cleanedQuery
    ? rankOptions(alias.label, treatments, treatmentSearchText)
    : [];
  const candidates = ranked.length ? ranked : aliasRanked;
  const winner = clearWinner(candidates);
  if (winner) {
    return {
      treatmentId: winner.id,
      treatmentType: winner.displayName,
      treatmentOptions: [],
      durationMinutes: winner.defaultDurationMinutes ?? durationFor(winner.displayName) ?? durationFor(cleanedQuery),
    };
  }

  if (candidates.length > 1) {
    return {
      treatmentType: null,
      treatmentOptions: candidates.slice(0, 6).map((item) => ({
        ...item.option,
        defaultDurationMinutes: item.option.defaultDurationMinutes ?? durationFor(item.option.displayName),
      })),
    };
  }

  return {
    treatmentType: cleanedQuery,
    treatmentOptions: [],
    durationMinutes: durationFor(cleanedQuery),
  };
}

export function isTreatmentMention(text: string) {
  return Boolean(extractTreatmentQuery(text));
}
