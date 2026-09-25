import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../client';
import { login, logout } from '../auth';
import { clearStoredAuthToken } from '../session';
import { createPaciente, getPaciente } from '../patients';
import { getPacienteCitas } from '../scheduling';
import { getPortalDocumentos } from '../portal';
import { demoAdapter } from './adapter';

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  clearStoredAuthToken();
  api.defaults.adapter = demoAdapter;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  clearStoredAuthToken();
  api.defaults.adapter = originalAdapter;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('explicit development demo adapter', () => {
  it('authenticates and reads fixtures without sending network requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await login('doctor', 'doctor123');
    const paciente = await getPaciente('demo-pac-1');
    expect(paciente.id).toBe('demo-pac-1');
    expect((await getPacienteCitas(paciente.id)).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects writes instead of simulating a clinical or economic record', async () => {
    await login('admin', 'admin1234');
    await expect(createPaciente({ nombre: 'Paciente', apellidos: 'Prueba' })).rejects.toThrow('no está disponible en este entorno');
  });

  it('never grants fixture access with invalid credentials or after logout', async () => {
    await expect(login('doctor', 'wrong')).rejects.toThrow('Credenciales demo incorrectas');
    await expect(getPaciente('demo-pac-1')).rejects.toThrow('Inicia una sesión demo');
    await login('doctor', 'doctor123');
    await logout();
    await expect(getPaciente('demo-pac-1')).rejects.toThrow('Inicia una sesión demo');
  });

  it('rejects use outside development even if imported directly', async () => {
    vi.stubEnv('DEV', false);
    await expect(login('admin', 'admin1234')).rejects.toThrow('solo está disponible en desarrollo');
  });
});

describe('live domain reads', () => {
  it('queries patient appointments once without a preliminary scheduling request', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    await getPacienteCitas('patient-real');
    expect(get).toHaveBeenCalledExactlyOnceWith('/pacientes/patient-real/citas');
  });

  it('queries portal documents without accessing another patient first', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    await getPortalDocumentos();
    expect(get).toHaveBeenCalledExactlyOnceWith('/portal/documentos', { params: {} });
  });

  it('propagates backend failures without returning demo patient information', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Backend no disponible'));
    await expect(getPaciente('patient-real')).rejects.toThrow('Backend no disponible');
  });
});
