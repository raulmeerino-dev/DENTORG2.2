import type { AxiosError } from 'axios';
import { API_BASE_URL, API_LOG_PREFIX } from './config';
import { checkBackendHealth } from './health';

export function logEndpointFailure(error: AxiosError) {
  const endpoint = error.config?.url ?? 'endpoint desconocido';
  const method = error.config?.method?.toUpperCase() ?? 'GET';
  console.warn(`${API_LOG_PREFIX} endpoint fallido`, {
    method,
    endpoint,
    baseURL: API_BASE_URL,
    status: error.response?.status,
    code: error.code,
  });
}

export async function describeAxiosError(error: AxiosError): Promise<string> {
  if (!error.response) {
    const code = error.code ?? 'NETWORK';
    const endpoint = error.config?.url ?? 'endpoint desconocido';
    const backendConnected = await checkBackendHealth({ force: true });
    if (!backendConnected) {
      return `Backend no conectado (${code}). Verifica que el backend este ejecutandose en ${API_BASE_URL}.`;
    }
    return `No se pudo completar la peticion (${code}) en ${endpoint}. Backend conectado; revisa el endpoint que fallo.`;
  }
  const { status, data } = error.response;
  if (data instanceof Blob) {
    const blobDetail = await readBlobErrorDetail(data);
    if (blobDetail) return blobDetail;
  }
  const detail = (data as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) {
      const loc = Array.isArray(first.loc) ? first.loc.filter((part) => part !== 'body').join('.') : '';
      return loc ? `${loc}: ${first.msg}` : first.msg;
    }
  }
  if (status === 401) return 'Sesion expirada o no autorizada. Vuelve a iniciar sesion.';
  if (status === 403) return 'No tienes permisos para esta accion.';
  if (status === 404) return 'Recurso no encontrado en el servidor.';
  if (status >= 500) return `Error en el servidor (${status}). Revisa los logs del backend.`;
  return `Error ${status} en la peticion.`;
}

export function getApiErrorMessage(error: unknown, fallback = 'Error inesperado.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

async function readBlobErrorDetail(data: Blob): Promise<string | null> {
  if (!data.size) return null;
  const text = await data.text();
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    if (Array.isArray(parsed.detail) && parsed.detail.length) {
      const first = parsed.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  } catch {
    // Not a JSON error payload.
  }
  return text.slice(0, 200);
}
