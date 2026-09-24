import { API_BASE_URL, API_HEALTH_URL, API_LOG_PREFIX } from './config';

type BackendHealthPayload = {
  ok?: boolean;
  service?: string;
  timestamp?: string;
};

let backendHealthPromise: Promise<boolean> | null = null;
let lastBackendHealthOk: boolean | null = null;

export async function checkBackendHealth({ force = false, timeoutMs = 2500 } = {}) {
  if (!force && lastBackendHealthOk === true) return true;
  if (backendHealthPromise) return backendHealthPromise;

  backendHealthPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API_HEALTH_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const contentType = response.headers?.get?.('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? ((await response.json().catch(() => null)) as BackendHealthPayload | null)
        : null;
      const ok = response.ok && payload?.ok === true;
      lastBackendHealthOk = ok;
      if (!ok) {
        console.warn(`${API_LOG_PREFIX} healthcheck fallido`, {
          healthURL: API_HEALTH_URL,
          status: response.status,
          payload,
        });
      }
      return ok;
    } catch (error) {
      lastBackendHealthOk = false;
      console.warn(`${API_LOG_PREFIX} fallo de conexion`, {
        baseURL: API_BASE_URL,
        healthURL: API_HEALTH_URL,
        error,
      });
      return false;
    } finally {
      clearTimeout(timeoutId);
      backendHealthPromise = null;
    }
  })();

  return backendHealthPromise;
}
