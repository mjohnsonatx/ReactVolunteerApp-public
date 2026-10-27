import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { developmentProject, developmentFirebaseConfig, validateDevelopmentEnvironment } from './development-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'app/.env.development.local');
const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const env = { ...local, ...process.env };
validateDevelopmentEnvironment(env);
const backendEnv = parseEnv(readFileSync(path.join(root, `functions/.env.${developmentProject}`), 'utf8'));
// Set before importing deployment metadata: every runtime identity must be dev-owned.
process.env.GCLOUD_PROJECT = developmentProject;
process.env.FIREBASE_PROJECT_ID = developmentProject;
for (const key of ['WATERSHED_SITE_URL', 'WATERSHED_WEB_APP_ID', 'WATERSHED_EMAIL_ENABLED']) process.env[key] = backendEnv[key];
const require = createRequire(import.meta.url);
const functions = require('../functions/lib/functions/src/index.js');
const withEmail = backendEnv.WATERSHED_EMAIL_ENABLED === 'true';
const hostingOnly = process.argv.includes('--hosting-only');
const backendOnly = process.argv.includes('--backend-only');
assert.ok(!(hostingOnly && backendOnly), 'Choose only one deployment scope');
const names = Object.keys(functions);
const startBatchArg = process.argv.find(arg => arg.startsWith('--start-batch='));
const startBatch = startBatchArg ? Number(startBatchArg.split('=')[1]) : 1;
assert.ok(Number.isInteger(startBatch) && startBatch >= 1 && startBatch <= Math.ceil(names.length / 10), 'Invalid starting Functions batch');
assert.ok(!hostingOnly || startBatch === 1, '--start-batch only applies to backend deployment');
for (const [name, fn] of Object.entries(functions)) {
  assert.ok(fn.__endpoint.serviceAccountEmail.endsWith(`@${developmentProject}.iam.gserviceaccount.com`), `${name} uses another project's identity`);
}
const configFile = path.join(root, `.firebase.dev.deploy.${process.pid}.json`);
const config = developmentFirebaseConfig(JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8')));
console.log(`Development project: ${developmentProject}; ${names.length} Functions; Brevo delivery ${withEmail ? 'enabled' : 'disabled until the dev SMTP key and login are configured'}.`);
if (!process.argv.includes('--apply')) {
  console.log('Configuration validated. Add --apply to deploy; --hosting-only or --backend-only restricts scope.');
  process.exit(0);
}
writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
const cleanup = () => rmSync(configFile, { force: true });
process.once('exit', cleanup);
async function deploy(only) {
  // Firebase requires --force to enable a retry policy non-interactively.
  // Limit it to batches containing these reviewed, transaction-fenced triggers.
  const notificationRetryBatch = only.split(',').some(target =>
    ['functions:notifyForumActivity', 'functions:notifyNewEvent'].includes(target));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'deploy',
      '--project', developmentProject, '--config', configFile, '--only', only, '--non-interactive',
      ...(notificationRetryBatch ? ['--force'] : []),
    ], { cwd: root, env: { ...env, GCLOUD_PROJECT: developmentProject, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Development deploy failed (${code})`)));
  });
}
try {
  if (!hostingOnly) {
    await deploy('firestore:rules,firestore:indexes,storage');
    // Bound concurrent first-time builds to avoid exhausting regional quotas.
    for (let start = (startBatch - 1) * 10; start < names.length; start += 10) {
      console.log(`Deploying Functions batch ${start / 10 + 1}/${Math.ceil(names.length / 10)}`);
      await deploy(names.slice(start, start + 10).map(name => `functions:${name}`).join(','));
    }
  }
  if (!backendOnly) await deploy('hosting');
} finally { cleanup(); }
