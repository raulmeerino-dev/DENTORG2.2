import { describe, expect, it } from 'vitest';
import type { RecordView } from '../../api/records';
import { recordQueryError, recordQueryFromUrl, urlForRecordView } from './recordQuery';

const patients: RecordView = {
  id: 'pacientes', label: 'Pacientes', group: 'records', filters: ['q', 'fecha_desde', 'fecha_hasta', 'estado'], states: [], types: [],
  columns: [{ key: 'paciente', label: 'Paciente', type: 'text', sortable: true }], can_export: false, export_formats: [], default_sort: { by: 'paciente', dir: 'asc' }, date_label: 'Fecha de alta',
};

describe('record URL query', () => {
  it('drops stale economic and tenant filters that the current role catalog does not permit', () => {
    const query = recordQueryFromUrl(new URLSearchParams('q=Martina&importe_min=5&clinica_id=foreign&sort_by=saldo&sort_dir=desc&limit=5000&offset=-50'), patients);
    expect(query).toEqual({ q: 'Martina', sort_by: 'paciente', sort_dir: 'asc', limit: 50, offset: 0 });
  });
  it('preserves shared filters when changing view, resetting page and unsupported ordering', () => {
    const next = urlForRecordView(new URLSearchParams('q=Ana&fecha_desde=2026-01-01&importe_min=5&offset=100&sort_by=importe&limit=25'), patients);
    expect(Object.fromEntries(next)).toEqual({ vista: 'pacientes', q: 'Ana', fecha_desde: '2026-01-01', limit: '25' });
  });
  it('rejects contradictory date and money ranges without dispatching them to the read model', () => {
    const query = recordQueryFromUrl(new URLSearchParams(), patients);
    expect(recordQueryError({ ...query, fecha_desde: '2026-09-24', fecha_hasta: '2026-01-01' })).toMatch(/fecha/i);
    expect(recordQueryError({ ...query, importe_min: '100', importe_max: '50' })).toMatch(/importe mínimo/i);
    expect(recordQueryError({ ...query, saldo_min: '-50', saldo_max: '0' })).toBe('');
  });
});
