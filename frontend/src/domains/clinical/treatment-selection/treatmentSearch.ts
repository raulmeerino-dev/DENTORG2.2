import type { TratamientoCatalogo } from '../../../api/types';

export type TreatmentOption = {
  id: string;
  name: string;
  code?: string | null;
  category?: string;
  price?: string | number;
  keywords?: readonly string[];
};

export function normalizeTreatmentSearch(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function describeCatalogTreatment(item: TratamientoCatalogo): TreatmentOption {
  return { id: item.id, name: item.nombre, code: item.codigo, category: item.familia?.nombre, price: item.precio };
}

export function indexTreatments<T>(items: readonly T[], describe: (item: T) => TreatmentOption) {
  return items.map(item => {
    const option = describe(item);
    const text = normalizeTreatmentSearch([option.code, option.name, option.category, ...(option.keywords ?? [])].filter(Boolean).join(' '));
    // Search vocabulary only: the selected catalog entry and its clinical meaning are unchanged.
    const hygiene = /profilaxis|limpieza/.test(text) ? ' limpieza profilaxis' : '';
    return { item, option, text: text + hygiene, name: normalizeTreatmentSearch(option.name), code: normalizeTreatmentSearch(option.code ?? '').replaceAll(' ', '') };
  });
}

export function filterTreatments<T>(index: ReturnType<typeof indexTreatments<T>>, query: string, category = '') {
  const normalized = normalizeTreatmentSearch(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const code = tokens.join('');
  const matches = index.filter(entry => (!category || entry.option.category === category)
    && (!tokens.length || (code && entry.code.includes(code)) || tokens.every(token => entry.text.includes(token))));
  if (!tokens.length) return matches;
  const rank = (entry: typeof index[number]) => {
    if (entry.code === code || entry.name === normalized) return 0;
    if (entry.code.startsWith(code) || entry.name.startsWith(normalized)) return 1;
    if (tokens.every(token => entry.name.includes(token))) return 2;
    return 3;
  };
  return matches.sort((a, b) => rank(a) - rank(b));
}
