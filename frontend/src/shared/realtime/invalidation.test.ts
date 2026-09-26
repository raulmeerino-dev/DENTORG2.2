import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { affectedQueries, invalidateChanges, type ChangeEvent } from './invalidation';

const change: ChangeEvent = { type: 'change', cursor: 7, event: 'appointment.updated', entity: 'citas', id: 'a1', patientId: 'p1', doctorId: 'd1' };
describe('selective realtime invalidation', () => {
  it('refreshes the shared agenda and affected patient without refetching other workspaces', async () => {
    const client = new QueryClient();
    const keys = [['citas', { day: 'today' }], ['citas-paciente', 'p1'], ['citas-paciente', 'p2'], ['notas-dentales', 'p1'], ['inventario'], ['me']];
    keys.forEach(key => client.setQueryData(key, [{ id: 'server-record' }]));
    await invalidateChanges(client, [change, change]);
    expect(keys.map(key => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, false, false, false, false]);
  });
  it('keeps a phone change separate from clinical notes, budgets and drafts', () => {
    const phone = { ...change, event: 'patient.updated', entity: 'pacientes' };
    expect(affectedQueries(phone, ['paciente-detalle', 'p1'])).toBe(true);
    expect(affectedQueries(phone, ['paciente-detalle', 'p2'])).toBe(false);
    expect(affectedQueries(phone, ['notas-dentales', 'p1'])).toBe(false);
    expect(affectedQueries(phone, ['sesion-items', 'p1'])).toBe(false);
  });
});
