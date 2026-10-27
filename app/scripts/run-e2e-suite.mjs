import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = path.resolve(appDir, '../node_modules/@playwright/test/cli.js');
const viteCli = path.resolve(appDir, '../node_modules/vite/bin/vite.js');
const requestedPort = Number(process.env.E2E_APP_PORT || 5173);
const appPort = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
  ? requestedPort
  : 5173;
const baseURL = `http://127.0.0.1:${appPort}`;

function exitResult(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // The Vite listener is not ready yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }

  const exited = await Promise.race([
    exitResult(child).then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (exited) return;
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // The process exited between the timeout and the signal.
  }
}

const vite = spawn(
  process.execPath,
  [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'],
  {
    cwd: appDir,
    env: process.env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
);

let testResult = { code: 1, signal: null };
try {
  await waitForServer(baseURL);
  const playwright = spawn(process.execPath, [playwrightCli, 'test'], {
    cwd: appDir,
    env: { ...process.env, E2E_APP_PORT: String(appPort) },
    stdio: 'inherit',
  });
  testResult = await exitResult(playwright);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await stopProcessTree(vite);
}

if (testResult.signal) {
  console.error(`Playwright exited with ${testResult.signal}.`);
  process.exitCode = 1;
} else {
  process.exitCode = testResult.code ?? 1;
}
