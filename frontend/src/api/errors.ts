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
    const backendConnected = await checkBackendHealth({ force: true });
    return backendConnected
      ? 'No se pudo completar la solicitud. Comprueba tu conexión y vuelve a intentarlo.'
      : 'No se puede conectar con DentCore. Comprueba tu conexión o contacta con el administrador.';
  }
  const { status, data } = error.response;
  if (status === 501) return 'Esta operación no está disponible en este entorno. Contacta con el administrador.';
  if (status >= 500) return 'DentCore no pudo completar la operación. Vuelve a intentarlo; si persiste, contacta con el administrador.';
  if (data instanceof Blob) {
    const blobDetail = await readBlobErrorDetail(data);
    if (blobDetail) return blobDetail;
  }
  const detail = (data as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return 'Revisa los datos del formulario: hay campos obligatorios o valores no válidos.';
  }
  if (status === 401) return 'Sesión expirada o no autorizada. Vuelve a iniciar sesión.';
  if (status === 403) return 'No tienes permisos para esta acción.';
  if (status === 404) return 'Recurso no encontrado en el servidor.';
  return 'No se pudo completar la solicitud. Revisa los datos y vuelve a intentarlo.';
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
      if (first?.msg) return 'Revisa los datos del formulario: hay campos obligatorios o valores no válidos.';
    }
  } catch {
    // Not a JSON error payload.
  }
  return null;
}
