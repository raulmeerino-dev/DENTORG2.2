import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getSessionGeneration } from './session';

// Retain uncertain operation IDs across retries. A definite validation/conflict
// response ends an attempt; a lost response must keep the same key.
export function installMutationInterceptors(api: AxiosInstance) {
  let generation = getSessionGeneration();
  const attempts = new Map<string, { key: string; finishedAt?: number }>();
  const revisions = new Map<string, number>();
  type CommandConfig = InternalAxiosRequestConfig & { _commandSignature?: string };

  function resetOwner() {
    if (generation === getSessionGeneration()) return;
    generation = getSessionGeneration(); attempts.clear(); revisions.clear();
  }
  function remember(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(remember); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && typeof record.revision === 'number') revisions.set(record.id, record.revision);
    Object.values(record).forEach(item => { if (item && typeof item === 'object') remember(item); });
  }
  api.interceptors.request.use(config => {
    resetOwner();
    if (!['post', 'put', 'patch', 'delete'].includes(config.method ?? '') || /^\/?auth\//.test(config.url ?? '') || config.data instanceof FormData) return config;
    let payload = config.data;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { /* Non-JSON command. */ } }
    const id = config.url?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/gi)?.at(-1);
    const revision = payload?.revision ?? (id ? revisions.get(id) : undefined);
    if (['put', 'patch'].includes(config.method ?? '') && revision !== undefined && !config.headers.has('If-Match')) config.headers.set('If-Match', String(revision));
    const signature = `${config.method}:${config.url}:${JSON.stringify(config.params)}:${JSON.stringify(payload)}:${config.headers.get('If-Match') ?? ''}`;
    const configCommand = config as CommandConfig;
    configCommand._commandSignature = signature;
    const previous = attempts.get(signature);
    if (!previous || (previous.finishedAt && Date.now() - previous.finishedAt > 1500)) {
      attempts.set(signature, { key: crypto.randomUUID() });
    }
    if (!config.headers.has('Idempotency-Key')) config.headers.set('Idempotency-Key', attempts.get(signature)!.key);
    return config;
  });
  api.interceptors.response.use(response => {
    resetOwner();
    remember(response.data);
    const signature = (response.config as CommandConfig)._commandSignature;
    const attempt = signature && attempts.get(signature);
    if (attempt) attempt.finishedAt = Date.now();
    for (const [key, value] of attempts) if (value.finishedAt && Date.now() - value.finishedAt > 1500) attempts.delete(key);
    return response;
  }, error => {
    const signature = (error.config as CommandConfig | undefined)?._commandSignature;
    if (signature && error.response?.status >= 400 && error.response.status < 500 && error.response.status !== 408 && error.response.status !== 401) attempts.delete(signature);
    return Promise.reject(error);
  });
}
