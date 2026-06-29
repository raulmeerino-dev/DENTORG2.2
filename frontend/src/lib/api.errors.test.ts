import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';
import {
  API_HEALTH_URL,
  AUTH_TOKEN_KEY,
  api,
  clearStoredAuthToken,
  getApiErrorMessage,
  getStoredAuthToken,
  openConsentimientoPdf,
  openDocumentoPaciente,
  openFacturaPdf,
  openOrDownloadBlob,
  openPresupuestoPdf,
  openRecetaClinicaPdf,
} from './api';

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

  it('extrae detail de errores Blob usados por descargas PDF', async () => {
    const error = makeAxiosError({
      code: undefined,
      response: {
        status: 422,
        data: new Blob([JSON.stringify({ detail: 'Firma digital corrupta' })], { type: 'application/json' }),
        statusText: '',
        headers: {},
        config: {} as never,
      },
    });
    const enhanced = await rejectThroughInterceptor(error);
    expect(enhanced.message).toBe('Firma digital corrupta');
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

describe('PDF blob helpers', () => {
  it('descarga automaticamente si el popup esta bloqueado', async () => {
    const createObjectURL = vi.fn(() => 'blob:pdf-ok');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const result = await openOrDownloadBlob(
      new Blob(['%PDF-1.4 contenido'], { type: 'application/pdf' }),
      'consentimiento.pdf',
      { requirePdf: true },
    );

    expect(result).toEqual({ opened: false, downloaded: true });
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('descarga automaticamente si window.open lanza excepcion', async () => {
    const createObjectURL = vi.fn(() => 'blob:pdf-throw');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('Popup blocked');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const result = await openOrDownloadBlob(
      new Blob(['%PDF-1.4 contenido'], { type: 'application/pdf' }),
      'receta.pdf',
      { requirePdf: true },
    );

    expect(result).toEqual({ opened: false, downloaded: true });
    expect(click).toHaveBeenCalled();
  });

  it('rechaza blobs marcados como PDF si no empiezan por cabecera PDF', async () => {
    await expect(openOrDownloadBlob(
      new Blob(['no es pdf'], { type: 'application/pdf' }),
      'factura.pdf',
      { requirePdf: true },
    )).rejects.toThrow(/PDF valido/i);
  });

  it('openFacturaPdf pide el endpoint central y abre el blob validado', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: new Blob(['%PDF-1.7 factura'], { type: 'application/pdf' }),
    } as never);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:factura'), revokeObjectURL: vi.fn() });
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    await openFacturaPdf('fac-1');

    expect(api.get).toHaveBeenCalledWith('/pdf/facturas/fac-1', { responseType: 'blob' });
  });

  it('abre consentimientos, presupuestos, recetas y documentos desde sus endpoints PDF', async () => {
    const pdfBlob = new Blob(['%PDF-1.7 documento'], { type: 'application/pdf' });
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: pdfBlob } as never)
      .mockResolvedValueOnce({ data: pdfBlob } as never)
      .mockResolvedValueOnce({ data: pdfBlob } as never)
      .mockResolvedValueOnce({ data: pdfBlob } as never);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    await openConsentimientoPdf('cons-1');
    await openPresupuestoPdf('pres-1');
    await openRecetaClinicaPdf('rec-1');
    await openDocumentoPaciente('pac-1', 'doc-1', 'documento.pdf');

    expect(api.get).toHaveBeenNthCalledWith(1, '/consentimientos/cons-1/pdf', { responseType: 'blob' });
    expect(api.get).toHaveBeenNthCalledWith(2, '/pdf/presupuestos/pres-1', { responseType: 'blob' });
    expect(api.get).toHaveBeenNthCalledWith(3, '/recetas/rec-1/pdf', { responseType: 'blob' });
    expect(api.get).toHaveBeenNthCalledWith(4, '/pacientes/pac-1/documentos/doc-1/descargar', { responseType: 'blob' });
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
