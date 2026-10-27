import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Publish the browser sign-in route independently of the public-site launch.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Emulator integration tests also write app/dist. Never publish that stale artifact.
const build = spawnSync('npm', ['run', 'build', '--workspace', 'app'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'false' },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
const directory = mkdtempSync(path.join(tmpdir(), 'tillery-desktop-auth-'));
const publicDirectory = path.join(directory, 'public');
cpSync(path.join(root, 'app/dist/assets'), path.join(publicDirectory, 'assets'), { recursive: true });
cpSync(path.join(root, 'app/dist/index.html'), path.join(publicDirectory, 'desktop-sign-in.html'));
const { hosting } = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const config = { hosting: {
  ...hosting, public: publicDirectory, predeploy: [],
  rewrites: [{ source: '/desktop-sign-in', destination: '/desktop-sign-in.html' }],
} };
const configPath = path.join(directory, 'firebase.json');
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(configPath);
if (process.argv.includes('--deploy')) {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'deploy',
    '--project', 'tillerystreettrail', '--only', 'hosting', '--config', configPath, '--non-interactive',
  ], { cwd: root, stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' } });
  if (result.error) throw result.error;
  process.exitCode = result.status || 0;
}
