import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { getFacturas } from './billing';

afterEach(() => vi.restoreAllMocks());

describe('invoice pagination', () => {
  it('loads every page before exposing balances to the workspace', async () => {
    const first = Array.from({ length: 200 }, (_, id) => ({ id: String(id) }));
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: [{ id: 'last' }] });
    const signal = new AbortController().signal;
    expect(await getFacturas('patient', signal)).toHaveLength(201);
    expect(get).toHaveBeenNthCalledWith(2, '/facturas', { params: { paciente_id: 'patient', limit: 200, offset: 200 }, signal });
  });
  it('does not silently show partial totals if a later page fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: Array(200).fill({ id: 'invoice' }) }).mockRejectedValueOnce(new Error('Connection interrupted'));
    await expect(getFacturas()).rejects.toThrow('Connection interrupted');
  });
});
