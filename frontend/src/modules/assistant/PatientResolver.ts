import { clearWinner, rankOptions } from './entityResolverUtils';
import { extractStructuredEntityPhrase } from './EntityPhraseParser';
import { cleanEntityText, normalizeAssistantText, titleCaseName } from './textUtils';
import type { AssistantContextSnapshot, AssistantIntentFields, AssistantPatientOption } from './types';

type PatientIntentKind = 'open' | 'search' | 'appointment' | 'generic';

const PATIENT_STOP_WORDS = [
  'agenda',
  'ficha',
  'cita',
  'paciente',
  'limpieza',
  'revision',
  'ortodoncia',
  'implante',
  'empaste',
  'endodoncia',
];

function optionSearchText(option: AssistantPatientOption) {
  return [
    option.displayName,
    option.phone,
    option.historyNumber,
  ].filter(Boolean).join(' ');
}

function stripPatientTail(value: string) {
  return cleanEntityText(value)
    .split(/\b(?:para|con|el|la semana|semana|hoy|manana|mejor|en seis|en 6|dentro|final|revision|limpieza|ortodoncia|implante|empaste|endodoncia|a las|por la tarde|por la manana)\b/i)[0]
    .trim();
}

export function findPatientCandidates(query: string | null | undefined, patients: AssistantPatientOption[]) {
  return rankOptions(query, patients, optionSearchText).slice(0, 8).map((item) => item.option);
}

export function findMentionedPatient(text: string, patients: AssistantPatientOption[]) {
  const normalized = normalizeAssistantText(text);
  return patients
    .sort((a, b) => b.displayName.length - a.displayName.length)
    .find((option) => normalizeAssistantText(option.displayName).split(' ').every((token) => normalized.includes(token))) ?? null;
}

export function extractPatientQuery(text: string, intent: PatientIntentKind, patients: AssistantPatientOption[]) {
  const structured = extractStructuredEntityPhrase(text);
  if (structured.patientQuery) return structured.patientQuery;

  const mentioned = findMentionedPatient(text, patients);
  if (mentioned) return mentioned.displayName;

  const normalized = normalizeAssistantText(text);
  const patterns = intent === 'appointment'
    ? [
        /\b(?:el\s+)?paciente\s+(?:es|seria|sera)\s+([a-z0-9 ]+)/,
        /\bcita\s+a\s+([a-z0-9 ]+)/,
        /\bdale\s+cita\s+a\s+([a-z0-9 ]+)/,
        /\bponle\s+(?:una\s+)?(?:cita\s+)?a\s+([a-z0-9 ]+)/,
        /^\s*no\s+([a-z0-9 ]+)/,
      ]
    : [
        /\bficha\s+de\s+([a-z0-9 ]+)/,
        /\babre\s+(?:la\s+)?(?:ficha\s+)?(?:de\s+)?([a-z0-9 ]+)/,
        /\bbusca(?:r)?\s+(?:a\s+)?([a-z0-9 ]+)/,
        /\bpaciente\s+([a-z0-9 ]+)/,
      ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const query = stripPatientTail(match?.[1] ?? '');
    if (query && !PATIENT_STOP_WORDS.includes(query)) return titleCaseName(query);
  }

  return null;
}

export function resolvePatientFields({
  query,
  context,
  patients,
  allowCurrentPatient,
}: {
  query: string | null;
  context: AssistantContextSnapshot;
  patients: AssistantPatientOption[];
  allowCurrentPatient: boolean;
}): AssistantIntentFields {
  if (!query && allowCurrentPatient && context.currentPatientId) {
    return {
      patientId: context.currentPatientId,
      patientDisplayName: context.currentPatientDisplayName ?? 'paciente actual',
      patientQuery: context.currentPatientDisplayName ?? 'paciente actual',
      patientOptions: [],
    };
  }

  if (!query) return {};
  const cleanedQuery = cleanEntityText(query);
  const ranked = rankOptions(cleanedQuery, patients, optionSearchText);
  const winner = clearWinner(ranked);
  if (winner) {
    return {
      patientQuery: cleanedQuery,
      patientId: winner.id,
      patientDisplayName: winner.displayName,
      patientOptions: [],
    };
  }

  return {
    patientQuery: cleanedQuery,
    patientId: null,
    patientOptions: ranked.slice(0, 8).map((item) => item.option),
  };
}
