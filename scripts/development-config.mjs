import assert from 'node:assert/strict';

export const developmentProject = 'tillerystreettrail-dev';
export const developmentProjectNumber = '274454283920';

export function validateDevelopmentEnvironment(env) {
  assert.equal(env.FIREBASE_PROJECT_ID, developmentProject, 'Development deploy must target the dev project');
  assert.equal(env.VITE_FIREBASE_PROJECT_ID, developmentProject, 'Preview client must use the dev backend');
  assert.equal(env.VITE_FIREBASE_AUTH_DOMAIN, `${developmentProject}.firebaseapp.com`);
  assert.equal(env.VITE_FIREBASE_STORAGE_BUCKET, `${developmentProject}.firebasestorage.app`);
  assert.equal(env.VITE_FIREBASE_MESSAGING_SENDER_ID, developmentProjectNumber);
  assert.ok(env.VITE_FIREBASE_APP_ID?.startsWith(`1:${developmentProjectNumber}:web:`), 'Wrong Firebase web app');
  assert.equal(env.VITE_RECAPTCHA_PROVIDER, 'enterprise', 'Development App Check uses reCAPTCHA Enterprise');
  assert.match(env.VITE_FIREBASE_VAPID_KEY || '', /^[A-Za-z0-9_-]{87}$/, 'Missing or malformed public VAPID key');
  const vapidKey = Buffer.from(env.VITE_FIREBASE_VAPID_KEY, 'base64url');
  assert.ok(vapidKey.length === 65 && vapidKey[0] === 4, 'VAPID must be an uncompressed public P-256 key');
  assert.notEqual(env.VITE_USE_FIREBASE_EMULATORS, 'true', 'Hosted development must use real Firebase');
  assert.notEqual(env.VITE_LOCAL_EMAIL_AUTO_VERIFY, 'true', 'Hosted accounts must verify their own email');
  for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_RECAPTCHA_SITE_KEY']) assert.ok(env[key], `Missing ${key}`);
}

export function developmentFirebaseConfig(base) {
  const config = structuredClone(base);
  // Pin the existing dev bucket instead of relying on default-bucket discovery,
  // which returns 404 for the restricted deployment identity.
  assert.equal(typeof base.storage?.rules, 'string', 'Expected the shared Storage rules file');
  config.storage = [{ bucket: `${developmentProject}.firebasestorage.app`, rules: base.storage.rules }];
  for (const rule of config.hosting.headers || []) {
    for (const header of rule.headers || []) {
      header.value = header.value.replaceAll(
        'https://us-central1-tillerystreettrail.cloudfunctions.net',
        `https://us-central1-${developmentProject}.cloudfunctions.net`,
      );
    }
  }
  config.hosting.site = developmentProject;
  return config;
}
