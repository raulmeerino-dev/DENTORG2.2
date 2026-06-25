export function normalizeAssistantText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function includesAny(text: string, terms: string[]) {
  const normalized = normalizeAssistantText(text);
  return terms.some((term) => normalized.includes(normalizeAssistantText(term)));
}

export function titleCaseName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('es-ES') + part.slice(1).toLocaleLowerCase('es-ES'))
    .join(' ');
}

export function cleanCapturedPhrase(value: string) {
  return value
    .replace(/[¿?¡!.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanEntityText(value: string) {
  let next = cleanCapturedPhrase(value);
  const suffixes = [
    /\s*,?\s*dime\s+(?:que|qué)\s+opciones\s+y\s+huecos\s+hay\s*$/i,
    /\s*,?\s*dime\s+(?:que|qué)\s+(?:opciones|huecos|disponibilidad)\s+hay\s*$/i,
    /\s*,?\s*mira\s+huecos\s*$/i,
    /\s*,?\s*busca\s+huecos\s*$/i,
    /\s*,?\s*(?:que|qué)\s+opciones\s+(?:tengo|hay)\s*$/i,
    /\s*,?\s*(?:que|qué)\s+huecos\s+hay\s*$/i,
    /\s*,?\s*(?:que|qué)\s+disponibilidad\s+hay\s*$/i,
    /\s*,?\s*(?:opciones|huecos|disponibilidad|hay)\s*$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      const cleaned = next.replace(suffix, '').trim();
      if (cleaned !== next) {
        next = cleaned;
        changed = true;
      }
    }
  }
  return cleanCapturedPhrase(next);
}

export function hasAvailabilityRequest(text: string) {
  return includesAny(text, [
    'dime que opciones hay',
    'dime que huecos hay',
    'dime que opciones y huecos hay',
    'mira huecos',
    'busca huecos',
    'que opciones tengo',
    'que opciones hay',
    'que huecos hay',
    'que disponibilidad hay',
    'opciones',
    'huecos',
    'disponibilidad',
  ]);
}
