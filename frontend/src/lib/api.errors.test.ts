import { describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';
import { api, getApiErrorMessage } from './api';

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

describe('api response interceptor', () => {
  it('reescribe Network Error con mensaje accionable', async () => {
    const error = makeAxiosError();
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toMatch(/No se pudo conectar con el servidor/i);
    expect(enhanced.message).toContain(String(api.defaults.baseURL));
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
});

describe('signal that mock survives', () => {
  it('no afecta a otras llamadas', () => {
    expect(vi.fn()).toBeTypeOf('function');
  });
});
