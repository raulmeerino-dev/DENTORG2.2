import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production API configuration', () => {
  it.each(['VITE_DEMO_MODE', 'VITE_DEMO_FALLBACK'])('rejects %s in production', async (flag) => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv(flag, 'true');
    await expect(import('./config')).rejects.toThrow('demo no está permitido en producción');
  });
});
