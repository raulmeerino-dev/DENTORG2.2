import { api } from './client';
import type { AuditLogEntry } from './types';

export type RecordColumnType = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'status';
export type RecordExportFormat = 'csv' | 'xlsx' | 'pdf';
export type RecordLookupKind = 'pacientes' | 'doctores' | 'clinicas' | 'tratamientos';
export type RecordFilterKey = 'q' | 'fecha_desde' | 'fecha_hasta' | 'paciente_id' | 'doctor_id' | 'clinica_id' | 'tratamiento_id' | 'tipo' | 'estado' | 'importe_min' | 'importe_max' | 'saldo_min' | 'saldo_max';
export interface RecordOption { value: string; label: string }
export interface RecordLookupOption { id: string; label: string }
export interface RecordColumn { key: string; label: string; type: RecordColumnType; sortable: boolean }
export interface RecordView {
  id: string;
  label: string;
  group: 'records' | 'files';
  filters: RecordFilterKey[];
  states: RecordOption[];
  types: RecordOption[];
  columns: RecordColumn[];
  can_export: boolean;
  export_formats: RecordExportFormat[];
  default_sort: { by: string; dir: 'asc' | 'desc' };
  date_label: string;
}
export interface RecordCatalog { views: RecordView[] }
export interface RecordTarget { kind: string; id: string; patient_id?: string | null; date?: string | null; doctor_id?: string | null }
export interface RecordRow { id: string; cells: Record<string, string | number | boolean | null>; target: RecordTarget | null }
export interface RecordPage { columns: RecordColumn[]; rows: RecordRow[]; total: number; offset: number; limit: number }
export type RecordQuery = Partial<Record<RecordFilterKey, string>> & { offset: number; limit: number; sort_by: string; sort_dir: 'asc' | 'desc' };

export async function getRecordCatalog(signal?: AbortSignal) {
  const { data } = await api.get<RecordCatalog>('/registros/catalogo', { signal });
  return data;
}

export async function getRecordPage(view: string, params: RecordQuery, signal?: AbortSignal) {
  const { data } = await api.get<RecordPage>(`/registros/${encodeURIComponent(view)}`, { params, signal });
  return data;
}

export async function getRecordOptions(kind: RecordLookupKind, q: string, signal?: AbortSignal) {
  const { data } = await api.get<RecordLookupOption[]>(`/registros/opciones/${kind}`, { params: { q, limit: 30 }, signal });
  return data;
}

export async function getAuditRecord(id: string, signal?: AbortSignal) {
  const { data } = await api.get<AuditLogEntry>(`/registros/auditoria/${encodeURIComponent(id)}`, { signal });
  return data;
}

export async function exportRecordPage(view: string, query: RecordQuery, format: RecordExportFormat, columns: string[]) {
  const { offset: _offset, limit: _limit, ...filters } = query;
  void _offset; void _limit;
  const { data } = await api.get<Blob>(`/registros/${encodeURIComponent(view)}/export`, {
    params: { ...filters, format, columns },
    paramsSerializer: { indexes: null },
    responseType: 'blob',
  });
  if (!data.size) throw new Error('La exportación está vacía.');
  return data;
}
