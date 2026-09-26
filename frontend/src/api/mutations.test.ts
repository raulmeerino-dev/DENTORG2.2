import axios, { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { installMutationInterceptors } from './mutations';

describe('logical command identity', () => {
  it('keeps one key for simultaneous submissions and a retry after a lost response', async () => {
    const keys: unknown[] = []; let fail = true;
    const api = axios.create({ adapter: async config => {
      keys.push(config.headers.get('Idempotency-Key'));
      if (fail) throw new AxiosError('Connection lost', 'ERR_NETWORK', config);
      return { config, data: { id: 'saved' }, status: 201, statusText: 'Created', headers: {} };
    } });
    installMutationInterceptors(api);
    const body = { importe: 50, paciente_id: 'p1' };
    await Promise.allSettled([api.post('/cuentas/p1/checkout', body), api.post('/cuentas/p1/checkout', body)]);
    fail = false;
    await api.post('/cuentas/p1/checkout', body);
    expect(keys[0]).toBeTruthy(); expect(new Set(keys).size).toBe(1);
  });
  it('uses the draft revision even after a newer server response is received', async () => {
    const versions: unknown[] = [];
    const id = '00000000-0000-0000-0000-000000000001';
    const api = axios.create({ adapter: async config => {
      if (config.method === 'patch') versions.push(config.headers.get('If-Match'));
      return { config, data: { id, revision: 15 }, status: 200, statusText: 'OK', headers: {} };
    } });
    installMutationInterceptors(api);
    await api.get(`/pacientes/${id}`);
    await api.patch(`/pacientes/${id}`, { telefono: '600111222', revision: 14 });
    expect(versions).toEqual(['14']);
  });
});
