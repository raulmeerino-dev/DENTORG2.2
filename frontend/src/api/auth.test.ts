import { afterEach, expect, it } from 'vitest';
import { api } from './client';
import { getMe } from './auth';
import { clearStoredAuthToken } from './session';
import { configureClinicTimeZone, getClinicTimeZone } from '../shared/time/clinicTime';

const originalAdapter = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  configureClinicTimeZone('Europe/Madrid');
});

it('configures the clinic calendar from the authenticated server contract', async () => {
  api.defaults.adapter = async config => ({ config, data: { id: 'doctor', clinic_timezone: 'Atlantic/Canary' }, status: 200, statusText: 'OK', headers: {} });
  await getMe();
  expect(getClinicTimeZone()).toBe('Atlantic/Canary');
});

it('does not let a response from an ended session change the clinic calendar', async () => {
  api.defaults.adapter = async config => {
    clearStoredAuthToken();
    return { config, data: { id: 'previous', clinic_timezone: 'Atlantic/Canary' }, status: 200, statusText: 'OK', headers: {} };
  };
  await expect(getMe()).rejects.toThrow();
  expect(getClinicTimeZone()).toBe('Europe/Madrid');
});
