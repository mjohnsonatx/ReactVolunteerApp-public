import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { developmentProject, developmentProjectNumber, developmentFirebaseConfig, validateDevelopmentEnvironment } from './development-config.mjs';

const valid = {
  FIREBASE_PROJECT_ID: developmentProject, VITE_FIREBASE_PROJECT_ID: developmentProject,
  VITE_FIREBASE_AUTH_DOMAIN: `${developmentProject}.firebaseapp.com`,
  VITE_FIREBASE_STORAGE_BUCKET: `${developmentProject}.firebasestorage.app`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: developmentProjectNumber,
  VITE_FIREBASE_APP_ID: `1:${developmentProjectNumber}:web:test`,
  VITE_FIREBASE_API_KEY: 'test', VITE_RECAPTCHA_SITE_KEY: 'test',
  VITE_RECAPTCHA_PROVIDER: 'enterprise', VITE_FIREBASE_VAPID_KEY: 'B' + 'A'.repeat(86),
};
validateDevelopmentEnvironment(valid);
for (const key of Object.keys(valid).filter(key => !key.endsWith('_KEY'))) {
  assert.throws(() => validateDevelopmentEnvironment({ ...valid, [key]: 'production-value' }), key);
}
for (const key of ['VITE_USE_FIREBASE_EMULATORS', 'VITE_LOCAL_EMAIL_AUTO_VERIFY']) {
  assert.throws(() => validateDevelopmentEnvironment({ ...valid, [key]: 'true' }), key);
}
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_RECAPTCHA_SITE_KEY', 'VITE_FIREBASE_VAPID_KEY']) {
  assert.throws(() => validateDevelopmentEnvironment({ ...valid, [key]: '' }), key);
}
assert.throws(() => validateDevelopmentEnvironment({ ...valid, VITE_FIREBASE_VAPID_KEY: 'A'.repeat(87) }));
const base = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const config = developmentFirebaseConfig(base);
assert.equal(config.hosting.site, developmentProject);
assert.deepEqual(config.storage, [{ bucket: `${developmentProject}.firebasestorage.app`, rules: base.storage.rules }]);
assert.ok(!Array.isArray(base.storage), 'Production Storage config was mutated');
assert.ok(!JSON.stringify(config).includes('https://us-central1-tillerystreettrail.cloudfunctions.net'));
assert.ok(JSON.stringify(base).includes('https://us-central1-tillerystreettrail.cloudfunctions.net'), 'Production config was mutated');
const script = `
const assert = require('node:assert/strict');
const { runtimeIdentity } = require('./functions/lib/functions/src/lib/runtimeIdentity.js');
const { callableOptions } = require('./functions/lib/functions/src/lib/options.js');
const { projectId, siteUrl } = require('./functions/lib/functions/src/lib/environment.js');
assert.equal(projectId, '${developmentProject}');
for (const value of Object.values(runtimeIdentity)) assert.ok(value.endsWith('@${developmentProject}.iam.gserviceaccount.com'));
const accepts = origin => callableOptions.cors.some(rule => typeof rule === 'string' ? rule === origin : rule.test(origin));
assert.ok(accepts('https://${developmentProject}.web.app'));
assert.ok(accepts('https://${developmentProject}--dev-test.web.app'));
assert.ok(!accepts('https://tillerystreettrail.web.app'));
assert.ok(!accepts('https://${developmentProject}.web.app.evil.example'));
assert.equal(callableOptions.enforceAppCheck, true);
assert.equal(siteUrl, 'https://${developmentProject}.web.app');
const mailer = require('./functions/lib/functions/src/lib/mailer.js');
assert.equal(mailer.smtpKey(), '');
assert.deepEqual(mailer.emailSecrets, []);
const functions = require('./functions/lib/functions/src/index.js');
for (const name of ['sendDailyDigest', 'getEmailDeliverySettings', 'sendTestEmail']) {
  assert.equal((functions[name].__endpoint.secretEnvironmentVariables || []).length, 0);
}
`;
const env = { ...process.env, GCLOUD_PROJECT: developmentProject, FUNCTIONS_EMULATOR: 'false', WATERSHED_SITE_URL: '', WATERSHED_EMAIL_ENABLED: 'false' };
let result = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
result = spawnSync(process.execPath, ['-e', script], { env: { ...env, WATERSHED_SITE_URL: 'https://tillerystreettrail.web.app' }, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'Cross-project notification links must fail closed');
console.log('Verified development deployment, client configuration, runtime identities, CORS, App Check, and notification-link isolation.');
