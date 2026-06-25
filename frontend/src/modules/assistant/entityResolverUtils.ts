import { normalizeAssistantText } from './textUtils';

export interface ScoredOption<T> {
  option: T;
  score: number;
}

export function compactTokens(value?: string | null) {
  return normalizeAssistantText(value).split(' ').filter(Boolean);
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = old;
    }
  }
  return row[b.length];
}

export function tokenScore(queryToken: string, candidateToken: string) {
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 0.92;
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return 0.82;

  const distance = levenshteinDistance(queryToken, candidateToken);
  const maxLength = Math.max(queryToken.length, candidateToken.length);
  if (maxLength <= 3) return distance <= 1 ? 0.72 : 0;
  const score = 1 - distance / maxLength;
  return score >= 0.66 ? score : 0;
}

export function scoreTokens(queryTokens: string[], candidateTokens: string[]) {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const total = queryTokens.reduce((sum, token) => {
    const best = candidateTokens.reduce((max, candidate) => Math.max(max, tokenScore(token, candidate)), 0);
    return sum + best;
  }, 0);
  return total / queryTokens.length;
}

export function rankOptions<T>(
  query: string | null | undefined,
  options: T[],
  textForOption: (option: T) => string,
  normalizeText: (value: string) => string = normalizeAssistantText,
) {
  const queryTokens = normalizeText(query ?? '').split(' ').filter(Boolean);
  if (!queryTokens.length) return [];

  return options
    .map((option) => {
      const candidateTokens = normalizeText(textForOption(option)).split(' ').filter(Boolean);
      return { option, score: scoreTokens(queryTokens, candidateTokens) };
    })
    .filter((item) => item.score >= 0.58)
    .sort((a, b) => b.score - a.score);
}

export function clearWinner<T>(ranked: ScoredOption<T>[]) {
  const [first, second] = ranked;
  if (!first) return null;
  if (!second) return first.score >= 0.58 ? first.option : null;
  if (first.score >= 0.9 && first.score - second.score >= 0.12) return first.option;
  return null;
}
