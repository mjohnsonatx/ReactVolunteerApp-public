import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This helper only ever talks to loopback emulators. It has no cloud credentials
// and cannot be pointed at a hosted Firebase project by a URL or CLI argument.
assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, 'demo-watershed');
assert.equal(process.env.VITE_USE_FIREBASE_EMULATORS, 'true');
assert.equal(process.env.VITE_FIREBASE_EMULATOR_HOST, '127.0.0.1');
assert.equal(process.env.VITE_LOCAL_EMAIL_AUTO_VERIFY, 'true');
const authPort = Number(process.env.E2E_AUTH_PORT);
const appPort = Number(process.env.E2E_APP_PORT);
for (const port of [authPort, appPort]) assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
const authOrigin = `http://127.0.0.1:${authPort}`;
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = spawn(process.execPath, [
  path.resolve(appDir, '../node_modules/vite/bin/vite.js'),
  'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort', '--outDir', '.local-preview-dist',
], { cwd: appDir, env: process.env, stdio: 'inherit' });

let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopped = true; vite.kill('SIGTERM'); });
vite.once('exit', () => { stopped = true; });
vite.once('error', () => { stopped = true; process.exitCode = 1; });
console.log(`\nLOCAL TEST PREVIEW: http://127.0.0.1:${appPort}`);
console.log('Disposable demo data only. New accounts are automatically email-verified. Use fake emails and test passwords, never real credentials.');
console.log('Keep this process running. Ctrl+C shuts down the preview and its emulators; data is not saved.\n');

try {
  while (!stopped) {
    const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/projects/demo-watershed/accounts:batchGet?maxResults=1000`, {
      headers: { Authorization: 'Bearer owner' }, signal: AbortSignal.timeout(5000),
    });
    assert.ok(response.ok, `Emulator account read failed (${response.status})`);
    const { users = [], nextPageToken } = await response.json();
    assert.ok(!nextPageToken, 'This disposable preview supports at most 1000 test accounts.');
    for (const user of users.filter(user => !user.emailVerified && user.email && !user.disabled)) {
      const verified = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
        method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: user.localId, emailVerified: true }), signal: AbortSignal.timeout(5000),
      });
      assert.ok(verified.ok, `Emulator verification failed (${verified.status})`);
    }
    await delay(1000);
  }
} catch (error) {
  if (!stopped) { console.error(error instanceof Error ? error.message : 'Local preview failed.'); process.exitCode = 1; }
} finally { vite.kill('SIGTERM'); }
