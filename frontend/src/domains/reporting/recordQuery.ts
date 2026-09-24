import type { RecordFilterKey, RecordQuery, RecordView } from '../../api/records';

export const RECORD_FILTER_KEYS: RecordFilterKey[] = ['q', 'fecha_desde', 'fecha_hasta', 'paciente_id', 'doctor_id', 'clinica_id', 'tratamiento_id', 'tipo', 'estado', 'importe_min', 'importe_max', 'saldo_min', 'saldo_max'];
export const RECORD_PAGE_SIZES = [25, 50, 100] as const;
export const ADVANCED_RECORD_FILTERS: RecordFilterKey[] = ['clinica_id', 'tratamiento_id', 'tipo', 'importe_min', 'importe_max', 'saldo_min', 'saldo_max'];

/** The server catalog is the allowlist; never forward stale or forbidden URL filters. */
export function recordQueryFromUrl(search: URLSearchParams, view: RecordView): RecordQuery {
  const query: RecordQuery = { offset: 0, limit: 50, sort_by: view.default_sort.by, sort_dir: view.default_sort.dir };
  for (const key of view.filters) {
    if (!RECORD_FILTER_KEYS.includes(key)) continue;
    const value = search.get(key)?.trim();
    if (value) query[key] = value;
  }
  const requestedOffset = Number(search.get('offset') ?? 0);
  if (Number.isInteger(requestedOffset) && requestedOffset >= 0) query.offset = requestedOffset;
  const requestedLimit = Number(search.get('limit'));
  if (RECORD_PAGE_SIZES.some(size => size === requestedLimit)) query.limit = requestedLimit;
  const requestedSort = search.get('sort_by');
  if (view.columns.some(column => column.key === requestedSort && column.sortable)) {
    query.sort_by = requestedSort!;
    query.sort_dir = search.get('sort_dir') === 'desc' ? 'desc' : 'asc';
  }
  return query;
}

export function recordQueryError(query: RecordQuery) {
  if (query.fecha_desde && query.fecha_hasta && query.fecha_desde > query.fecha_hasta) return 'La fecha de inicio debe ser anterior o igual a la fecha final.';
  for (const prefix of ['importe', 'saldo'] as const) {
    const min = query[`${prefix}_min`], max = query[`${prefix}_max`];
    if ((min && !Number.isFinite(Number(min))) || (max && !Number.isFinite(Number(max)))) return 'Introduce importes numéricos válidos.';
    if (min && max && Number(min) > Number(max)) return `El ${prefix} mínimo no puede superar al máximo.`;
  }
  return '';
}

export function urlForRecordView(current: URLSearchParams, view: RecordView) {
  const next = new URLSearchParams();
  next.set('vista', view.id);
  for (const key of view.filters) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  if (current.has('limit')) next.set('limit', current.get('limit')!);
  return next;
}
