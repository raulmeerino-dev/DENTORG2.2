import axios, { CanceledError } from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { describeAxiosError, logEndpointFailure } from './errors';

export const AUTH_TOKEN_KEY = 'dentcore_token';
let inMemoryAuthToken: string | null = null;
let authGeneration = 0;
let refreshFlight: { generation: number; promise: Promise<string> } | null = null;
const sessionExpiredListeners = new Set<() => void>();

type SessionRequestConfig = InternalAxiosRequestConfig & {
  _authGeneration?: number;
  _authToken?: string;
  _authRetried?: boolean;
};

export function getSessionGeneration() {
  return authGeneration;
}

function isAuthBoundary(url = '') {
  return /^\/?auth\/(login|refresh|logout)(?:[/?#]|$)/.test(url);
}

export function subscribeToSessionExpiration(listener: () => void) {
  sessionExpiredListeners.add(listener);
  return () => { sessionExpiredListeners.delete(listener); };
}

function expireSession() {
  const hadToken = Boolean(inMemoryAuthToken);
  clearStoredAuthToken();
  if (hadToken) sessionExpiredListeners.forEach((listener) => listener());
}

export function getStoredAuthToken() {
  return inMemoryAuthToken;
}

export function setStoredAuthToken(token: string) {
  inMemoryAuthToken = token;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearStoredAuthToken() {
  authGeneration += 1;
  inMemoryAuthToken = null;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function refreshSessionToken(api: AxiosInstance) {
  if (refreshFlight?.generation === authGeneration) return refreshFlight.promise;
  const generation = authGeneration;
  const promise = (async () => {
    try {
      const { data } = await api.post<{ access_token: string }>('/auth/refresh', undefined, { timeout: 10_000 });
      if (generation !== authGeneration) throw new CanceledError('La sesión ha cambiado.');
      if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
        throw new Error('No se pudo renovar la sesión. Vuelve a iniciar sesión.');
      }
      setStoredAuthToken(data.access_token);
      return data.access_token;
    } catch (error) {
      if (generation === authGeneration) expireSession();
      throw error;
    } finally {
      if (refreshFlight?.generation === generation) refreshFlight = null;
    }
  })();
  refreshFlight = { generation, promise };
  return promise;
}

export function installSessionInterceptors(api: AxiosInstance) {
  api.interceptors.request.use((config) => {
    const sessionConfig = config as SessionRequestConfig;
    if (sessionConfig._authGeneration !== undefined && sessionConfig._authGeneration !== authGeneration) {
      throw new CanceledError('La sesión ha cambiado.');
    }
    const token = getStoredAuthToken();
    if (token && !isAuthBoundary(config.url)) {
      config.headers.Authorization = `Bearer ${token}`;
      sessionConfig._authGeneration = authGeneration;
      sessionConfig._authToken = token;
    } else {
      config.headers.delete('Authorization');
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      const config = response.config as SessionRequestConfig;
      if (config._authGeneration !== undefined && config._authGeneration !== authGeneration) {
        throw new CanceledError('La sesión ha cambiado.');
      }
      return response;
    },
    async (error) => {
      const axiosError = error as AxiosError;
      const config = axiosError.config as SessionRequestConfig | undefined;
      if (config?._authGeneration !== undefined && config._authGeneration !== authGeneration) {
        return Promise.reject(new CanceledError('La sesión ha cambiado.'));
      }
      if (axiosError.response?.status === 401 && config?._authToken && !isAuthBoundary(config.url)) {
        if (config._authRetried) {
          expireSession();
        } else {
          config._authRetried = true;
          try {
            // Late 401s from the old token reuse the token already renewed by another request.
            if (config._authToken === getStoredAuthToken()) await refreshSessionToken(api);
            if (config._authGeneration !== authGeneration || !getStoredAuthToken()) {
              throw new CanceledError('La sesión ha cambiado.');
            }
            return api.request(config);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }
      }
      if (axios.isCancel(error)) return Promise.reject(error);
      if (axiosError?.isAxiosError) {
        logEndpointFailure(axiosError);
        axiosError.message = await describeAxiosError(axiosError);
      }
      return Promise.reject(error);
    },
  );
}
