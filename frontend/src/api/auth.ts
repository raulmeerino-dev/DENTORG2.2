import { api } from './client';
import type {
  UsuarioMe,
} from './types';
import { CanceledError } from 'axios';
import { clearStoredAuthToken, getSessionGeneration, setStoredAuthToken, refreshSessionToken } from './session';
import { configureClinicTimeZone } from '../shared/time/clinicTime';

export async function login(username: string, password: string, otp?: string) {
  clearStoredAuthToken();
  const generation = getSessionGeneration();
  const { data } = await api.post<{ access_token: string }>('/auth/login', { username, password, otp });
  if (generation !== getSessionGeneration()) throw new CanceledError('La sesión ha cambiado.');
  setStoredAuthToken(data.access_token);
  return data.access_token;
}

export function refreshAuthToken() {
  return refreshSessionToken(api);
}

export async function logout() {
  clearStoredAuthToken();
  await api.post('/auth/logout').catch(() => undefined);
}

export async function getMe() {
  const generation = getSessionGeneration();
  const { data } = await api.get<UsuarioMe>('/auth/me');
  if (generation !== getSessionGeneration()) throw new CanceledError('La sesión ha cambiado.');
  configureClinicTimeZone(data.clinic_timezone ?? 'Europe/Madrid');
  return data;
}

export async function enableTwoFactor() {
  const { data } = await api.post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/auth/2fa-enable');
  return data;
}
