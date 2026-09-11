import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearStoredAuthToken, getStoredAuthToken, login, logout, refreshAuthToken, subscribeToSessionExpiration } from './api';

const originalAdapter = api.defaults.adapter;

function response(config: InternalAxiosRequestConfig, data: unknown = { ok: true }): AxiosResponse {
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}

function rejected(config: InternalAxiosRequestConfig, status = 401) {
  return Promise.reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    ...response(config, { detail: 'Sesión expirada' }), status,
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function authenticate() {
  api.defaults.adapter = async (config) => response(config, { access_token: 'old-token' });
  await login('doctor', 'password');
}

beforeEach(() => {
  clearStoredAuthToken();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  clearStoredAuthToken();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

describe('silent session recovery', () => {
  it('renews once and retries a write with its original method, payload and params', async () => {
    await authenticate();
    const calls: Array<{ url?: string; auth: unknown; data: unknown; method?: string; params: unknown }> = [];
    api.defaults.adapter = async (config) => {
      calls.push({ url: config.url, auth: config.headers.Authorization, data: config.data, method: config.method, params: config.params });
      if (config.url === '/auth/refresh') return response(config, { access_token: 'new-token' });
      return config.headers.Authorization === 'Bearer new-token' ? response(config) : rejected(config);
    };

    await expect(api.patch('/clinical-note', { texto: 'Nota sin perder' }, { params: { paciente_id: 'pac-1' } })).resolves.toMatchObject({ status: 200 });
    expect(calls.map(({ url }) => url)).toEqual(['/clinical-note', '/auth/refresh', '/clinical-note']);
    expect(calls[2]).toEqual({ ...calls[0], auth: 'Bearer new-token' });
    expect(calls[1].auth).toBeUndefined();
    expect(getStoredAuthToken()).toBe('new-token');
  });

  it('shares one refresh for concurrent requests and reuses it for a late old-token 401', async () => {
    await authenticate();
    const refresh = deferred<void>();
    const late = deferred<void>();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url === '/auth/refresh') {
        await refresh.promise;
        return response(config, { access_token: 'new-token' });
      }
      if (config.headers.Authorization === 'Bearer new-token') return response(config);
      if (config.url === '/late') await late.promise;
      return rejected(config);
    });
    api.defaults.adapter = adapter;
    const requests = [api.get('/one'), api.get('/two')];
    const lateRequest = api.get('/late');
    await vi.waitFor(() => expect(adapter.mock.calls.filter(([config]) => config.url === '/auth/refresh')).toHaveLength(1));
    refresh.resolve();
    await Promise.all(requests);
    late.resolve();
    await lateRequest;
    expect(adapter.mock.calls.filter(([config]) => config.url === '/auth/refresh')).toHaveLength(1);
  });

  it('shares bootstrap renewal, including duplicated StrictMode effects', async () => {
    const refresh = deferred<void>();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      await refresh.promise;
      return response(config, { access_token: 'boot-token' });
    });
    api.defaults.adapter = adapter;
    const first = refreshAuthToken();
    const second = refreshAuthToken();
    expect(first).toBe(second);
    refresh.resolve();
    await Promise.all([first, second]);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('expires the session once when a refresh fails and never retries the original writes', async () => {
    await authenticate();
    const onExpired = vi.fn();
    const unsubscribe = subscribeToSessionExpiration(onExpired);
    const adapter = vi.fn<AxiosAdapter>((config) => rejected(config));
    api.defaults.adapter = adapter;
    const results = await Promise.allSettled([api.post('/note', { text: 'draft' }), api.get('/patient')]);
    await expect(api.get('/later')).rejects.toBeInstanceOf(Error);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(adapter.mock.calls.filter(([config]) => config.url === '/auth/refresh')).toHaveLength(1);
    expect(adapter.mock.calls.filter(([config]) => config.url === '/note')).toHaveLength(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getStoredAuthToken()).toBeNull();
    unsubscribe();
  });

  it('does not loop if the retried request is still unauthorized', async () => {
    await authenticate();
    const adapter = vi.fn<AxiosAdapter>(async (config) => config.url === '/auth/refresh'
      ? response(config, { access_token: 'new-token' }) : rejected(config));
    api.defaults.adapter = adapter;
    await expect(api.get('/private')).rejects.toBeInstanceOf(Error);
    expect(adapter).toHaveBeenCalledTimes(3);
    expect(getStoredAuthToken()).toBeNull();
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/logout'])('never recursively refreshes %s', async (url) => {
    await authenticate();
    const adapter = vi.fn<AxiosAdapter>((config) => rejected(config));
    api.defaults.adapter = adapter;
    await expect(api.post(url)).rejects.toBeInstanceOf(Error);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('does not renew on permission failures or anonymous 401s', async () => {
    const adapter = vi.fn<AxiosAdapter>((config) => rejected(config));
    api.defaults.adapter = adapter;
    await expect(api.get('/public')).rejects.toBeInstanceOf(Error);
    expect(adapter).toHaveBeenCalledTimes(1);
    await authenticate();
    api.defaults.adapter = vi.fn<AxiosAdapter>((config) => rejected(config, 403));
    await expect(api.get('/admin')).rejects.toBeInstanceOf(Error);
    expect(api.defaults.adapter).toHaveBeenCalledTimes(1);
    expect(getStoredAuthToken()).toBe('old-token');
  });

  it('discards a late refresh and response after logout without restoring the session', async () => {
    await authenticate();
    const gate = deferred<void>();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url !== '/auth/logout') await gate.promise;
      return response(config, { access_token: 'late-token' });
    });
    api.defaults.adapter = adapter;
    const refresh = refreshAuthToken();
    const pendingRead = api.get('/patient');
    const results = Promise.allSettled([refresh, pendingRead]);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
    await logout();
    gate.resolve();
    expect((await results).every((result) => result.status === 'rejected')).toBe(true);
    expect(getStoredAuthToken()).toBeNull();
  });

  it('an older refresh cannot replace a new login', async () => {
    await authenticate();
    const gate = deferred<void>();
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') await gate.promise;
      return response(config, { access_token: config.url === '/auth/login' ? 'other-user' : 'late-token' });
    };
    const pendingRefresh = refreshAuthToken();
    const result = Promise.allSettled([pendingRefresh]);
    await login('other', 'password');
    gate.resolve();
    expect((await result)[0].status).toBe('rejected');
    expect(getStoredAuthToken()).toBe('other-user');
  });
});
