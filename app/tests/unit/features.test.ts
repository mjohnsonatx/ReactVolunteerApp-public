import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('document launch gate', () => {
  it.each([true, false])('only enables documents during local development (DEV=%s)', async (dev) => {
    vi.resetModules();
    vi.stubEnv('DEV', dev);
    const { PUBLIC_DOCUMENTS_ENABLED } = await import('../../src/features');
    expect(PUBLIC_DOCUMENTS_ENABLED).toBe(dev);
  });
});

describe('local-only automatic email verification', () => {
  it.each([
    ['true', 'true', 'demo-watershed', '127.0.0.1', true],
    ['true', 'false', 'demo-watershed', '127.0.0.1', false],
    ['true', 'true', 'tillerystreettrail', '127.0.0.1', false],
    ['true', 'true', 'demo-watershed', 'example.com', false],
    ['false', 'true', 'demo-watershed', '127.0.0.1', false],
  ])('requires all emulator-only guards (%s, %s, %s, %s)', async (enabled, emulators, project, host, expected) => {
    vi.resetModules();
    vi.stubEnv('VITE_LOCAL_EMAIL_AUTO_VERIFY', enabled as string);
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', emulators as string);
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', project as string);
    vi.stubEnv('VITE_FIREBASE_EMULATOR_HOST', host as string);
    const { LOCAL_EMAIL_TEST_MODE } = await import('../../src/features');
    expect(LOCAL_EMAIL_TEST_MODE).toBe(expected);
  });
});
