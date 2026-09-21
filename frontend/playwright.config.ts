import { defineConfig, devices } from '@playwright/test';

// Keep API fixtures, browser dates and clinic opening hours in the same timezone.
process.env.TZ = process.env.DENTCORE_E2E_TIMEZONE ?? 'Europe/Madrid';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    timezoneId: process.env.TZ,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
