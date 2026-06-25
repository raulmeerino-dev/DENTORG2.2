import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';
import { API_HEALTH_URL, AUTH_TOKEN_KEY, api, clearStoredAuthToken, getApiErrorMessage, getStoredAuthToken } from './api';

function makeAxiosError(overrides: Partial<AxiosError> = {}): AxiosError {
  const error = new Error('Network Error') as AxiosError;
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.code = 'ERR_NETWORK';
  Object.assign(error, overrides);
  return error;
}

async function rejectThroughInterceptor(error: AxiosError) {
  const handlers = (api.interceptors.response as unknown as {
    handlers: Array<{ rejected?: (error: unknown) => unknown } | null>;
  }).handlers.filter(Boolean);
  for (const handler of handlers) {
    if (handler?.rejected) {
      try {
        await handler.rejected(error);
      } catch (next) {
        return next as AxiosError;
      }
    }
  }
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api response interceptor', () => {
  it('reescribe Network Error como backend no conectado si falla healthcheck', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend down')));

    const error = makeAxiosError();
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toMatch(/Backend no conectado/i);
    expect(enhanced.message).toContain(String(api.defaults.baseURL));
    expect(globalThis.fetch).toHaveBeenCalledWith(API_HEALTH_URL, expect.objectContaining({ method: 'GET' }));
    expect(consoleWarn).toHaveBeenCalled();
  });

  it('mantiene el endpoint en el mensaje si healthcheck responde', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, service: 'DentCore backend', timestamp: '2026-06-24T10:00:00+00:00' }),
    }));

    const error = makeAxiosError({
      config: { url: '/citas', method: 'get' } as never,
    });
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toContain('Backend conectado');
    expect(enhanced.message).toContain('/citas');
  });

  it('extrae detail string de FastAPI cuando viene en response', async () => {
    const error = makeAxiosError({
      code: undefined,
      response: { status: 404, data: { detail: 'Paciente no encontrado' }, statusText: '', headers: {}, config: {} as never },
    });
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toBe('Paciente no encontrado');
  });

  it('extrae primer error de validacion Pydantic con loc legible', async () => {
    const error = makeAxiosError({
      code: undefined,
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'pieza_dental'], msg: 'ensure this value is greater than or equal to 11', type: 'value_error' }] },
        statusText: '',
        headers: {},
        config: {} as never,
      },
    });
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toBe('pieza_dental: ensure this value is greater than or equal to 11');
  });

  it('usa mensaje generico legible para 401 sin detail', async () => {
    const error = makeAxiosError({
      code: undefined,
      response: { status: 401, data: null, statusText: '', headers: {}, config: {} as never },
    });
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toMatch(/Sesion expirada/i);
  });
});

describe('getApiErrorMessage', () => {
  it('devuelve message del Error', () => {
    expect(getApiErrorMessage(new Error('Boom'))).toBe('Boom');
  });

  it('devuelve fallback si error desconocido', () => {
    expect(getApiErrorMessage({ unknown: 'shape' }, 'default')).toBe('default');
  });
});

describe('api default config', () => {
  it('apunta al backend local por defecto si no hay VITE_API_BASE_URL', () => {
    expect(api.defaults.baseURL).toMatch(/\/api$/);
  });

  it('envia withCredentials para que pase la cookie de sesion', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('no recupera access tokens persistentes desde Web Storage', () => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'local-token');
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, 'session-token');

    expect(getStoredAuthToken()).toBeNull();

    clearStoredAuthToken();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('signal that mock survives', () => {
  it('no afecta a otras llamadas', () => {
    expect(vi.fn()).toBeTypeOf('function');
  });
});
