const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8011/api';
export const API_LOG_PREFIX = '[DentCore API]';

function normalizeApiBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL;
export const API_BASE_URL = normalizeApiBaseUrl(configuredApiBaseUrl ?? DEFAULT_API_BASE_URL);
export const API_HEALTH_URL = `${API_BASE_URL}/health`;

if (import.meta.env.PROD && (import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.VITE_DEMO_FALLBACK === 'true')) {
  throw new Error('El modo demo no está permitido en producción: DentCore debe usar la API real.');
}
