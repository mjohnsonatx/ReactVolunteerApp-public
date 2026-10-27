import { defineConfig } from '@playwright/test';
const requestedAppPort = Number(process.env.E2E_APP_PORT || 5173);
const appPort = Number.isInteger(requestedAppPort) && requestedAppPort > 0 && requestedAppPort <= 65535
  ? requestedAppPort
  : 5173;
const baseURL = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL, trace: 'on-first-retry' },
});
