import { TREATMENT_ALIASES } from './TreatmentResolver';
import { cleanEntityText, normalizeAssistantText, titleCaseName } from './textUtils';
import type { AssistantBudgetLine, AssistantTreatmentOption } from './types';

type TreatmentMention = {
  index: number;
  end: number;
  query: string;
};

const BUDGET_TERMS = [
  'presupuesto',
  'presu',
  'coste de',
  'costo de',
  'valorar economicamente',
  'valoracion economica',
];

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function treatmentTerms(treatments: AssistantTreatmentOption[]) {
  const aliasTerms = TREATMENT_ALIASES.flatMap((alias) => [
    alias.label,
    ...alias.keys,
  ]);
  const catalogTerms = treatments.flatMap((treatment) => [
    treatment.displayName,
    treatment.code,
    treatment.familyName,
  ].filter(Boolean) as string[]);

  return uniqueBy([...aliasTerms, ...catalogTerms]
    .map((term) => normalizeAssistantText(term))
    .filter((term) => term.length >= 3)
    .sort((a, b) => b.length - a.length), (term) => term);
}

function findTreatmentMentions(text: string, treatments: AssistantTreatmentOption[]): TreatmentMention[] {
  const mentions: TreatmentMention[] = [];
  for (const term of treatmentTerms(treatments)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`(^|\\s)(${escaped})(?:s|es)?(?=\\s|$)`, 'g');
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text))) {
      const index = match.index + (match[1]?.length ?? 0);
      const end = index + term.length;
      if (mentions.some((item) => index >= item.index && index < item.end)) continue;
      mentions.push({ index, end, query: term });
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
}

function teethIn(text: string) {
  return Array.from(text.matchAll(/\b([1-8][1-8])\b/g)).map((match) => match[1]);
}

function quantityFromText(text: string) {
  if (/\b(?:dos|2)\b/.test(text)) return 2;
  if (/\b(?:tres|3)\b/.test(text)) return 3;
  return 1;
}

function lineFromMention(mention: TreatmentMention, segment: string): AssistantBudgetLine[] {
  const teeth = uniqueBy(teethIn(segment), (tooth) => tooth);
  const quantity = quantityFromText(segment);
  if (teeth.length) {
    return teeth.map((tooth) => ({
      treatmentQuery: mention.query,
      tooth,
      quantity: 1,
    }));
  }
  return [{
    treatmentQuery: mention.query,
    tooth: null,
    quantity,
  }];
}

function conceptTextFromRequest(text: string) {
  const normalized = normalizeAssistantText(text);
  const patientMatch = normalized.match(/\b(?:presupuesto|presu)\s+para\s+(.+?)\s+de\s+(.+)$/);
  if (patientMatch?.[2]) return patientMatch[2];

  const directMatch = normalized.match(/\b(?:presupuesto|presu)\s+de\s+(.+)$/);
  if (directMatch?.[1]) return directMatch[1];

  const costMatch = normalized.match(/\b(?:coste|costo)\s+de\s+(.+)$/);
  if (costMatch?.[1]) return costMatch[1];

  const deIndex = normalized.indexOf(' de ');
  return deIndex >= 0 ? normalized.slice(deIndex + 4) : normalized;
}

export function isBudgetRequestText(text: string) {
  const normalized = normalizeAssistantText(text);
  return BUDGET_TERMS.some((term) => normalized.includes(normalizeAssistantText(term)))
    || /\b(?:preparale|hazle|hazme|hacer|prepara)\s+(?:un\s+)?presu\b/.test(normalized);
}

export function extractBudgetPatientQuery(text: string) {
  const normalized = normalizeAssistantText(text);
  const match = normalized.match(/\b(?:presupuesto|presu)\s+para\s+(.+?)\s+de\s+/)
    ?? normalized.match(/\b(?:hazme|hacer|prepara|preparale|hazle)\s+(?:un\s+)?(?:presupuesto|presu)\s+para\s+(.+?)\s+de\s+/);
  const value = cleanEntityText(match?.[1] ?? '');
  return value ? titleCaseName(value) : null;
}

export function extractBudgetLinesFromText(text: string, treatments: AssistantTreatmentOption[]): AssistantBudgetLine[] {
  const concept = conceptTextFromRequest(text)
    .replace(/\by\s+otr[ao]s?\s+(?:en|pieza)\s+(?:el\s+)?/g, ' y ')
    .replace(/\b(?:en|pieza)\s+el\s+/g, 'en ');
  const normalized = normalizeAssistantText(concept);
  const mentions = findTreatmentMentions(normalized, treatments);

  if (!mentions.length) return [];

  return mentions.flatMap((mention, index) => {
    const next = mentions[index + 1];
    const segment = normalized.slice(mention.index, next?.index ?? normalized.length);
    return lineFromMention(mention, segment);
  });
}

export function normalizeBudgetLines(
  lines: AssistantBudgetLine[] | null | undefined,
  fallbackText: string,
  treatments: AssistantTreatmentOption[],
) {
  const parsed = lines?.length ? lines : extractBudgetLinesFromText(fallbackText, treatments);
  return parsed.map((line) => ({
    treatmentQuery: line.treatmentQuery ? cleanEntityText(line.treatmentQuery) : null,
    treatmentId: line.treatmentId ?? null,
    treatmentName: line.treatmentName ?? null,
    description: line.description ? cleanEntityText(line.description) : null,
    tooth: line.tooth ? String(line.tooth).trim() : null,
    quantity: line.quantity ?? 1,
    unitPrice: line.unitPrice ?? null,
    discount: line.discount ?? null,
    total: line.total ?? null,
  }));
}
