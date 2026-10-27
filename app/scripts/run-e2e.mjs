import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..');
const functionsDir = path.join(repoRoot, 'functions');
const firebaseCli = path.join(repoRoot, 'node_modules/firebase-tools/lib/bin/firebase.js');
const firebaseJson = path.join(repoRoot, 'firebase.json');
const runtimeFirebaseJson = path.join(
  repoRoot,
  `.firebase.e2e.${process.pid}.${Date.now()}.json`,
);
const firebaseConfigHome = path.join(appDir, '.firebase-config');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const localPreview = process.argv.includes('--local-preview');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal || code}`));
    });
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve an E2E port.'));
        return;
      }
      resolve({
        port: address.port,
        release: () => new Promise((releaseResolve, releaseReject) => {
          server.close((error) => error ? releaseReject(error) : releaseResolve());
        }),
      });
    });
  });
}

async function reservePorts(names) {
  const reservations = {};
  try {
    for (const name of names) {
      reservations[name] = await reservePort();
    }
    return reservations;
  } catch (error) {
    await Promise.allSettled(Object.values(reservations).map(({ release }) => release()));
    throw error;
  }
}

async function writeRuntimeFirebaseConfig(ports) {
  const config = JSON.parse(await readFile(firebaseJson, 'utf8'));
  const host = '127.0.0.1';
  config.emulators = {
    ...config.emulators,
    auth: { ...config.emulators?.auth, host, port: ports.auth.port },
    firestore: {
      ...config.emulators?.firestore,
      host,
      port: ports.firestore.port,
      websocketPort: ports.firestoreWebsocket.port,
    },
    storage: { ...config.emulators?.storage, host, port: ports.storage.port },
    functions: { ...config.emulators?.functions, host, port: ports.functions.port },
    hub: { host, port: ports.hub.port },
    logging: { host, port: ports.logging.port },
    ui: { enabled: false },
  };
  await writeFile(runtimeFirebaseJson, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function cleanupRuntimeFirebaseConfig() {
  rmSync(runtimeFirebaseJson, { force: true });
}

process.once('exit', cleanupRuntimeFirebaseConfig);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    cleanupRuntimeFirebaseConfig();
    process.kill(process.pid, signal);
  });
}

let reservations;

try {
  await run(npmCommand, ['--prefix', functionsDir, 'run', 'build'], { cwd: repoRoot, env: process.env });
  reservations = await reservePorts([
    'app',
    'auth',
    'firestore',
    'firestoreWebsocket',
    'storage',
    'functions',
    'hub',
    'logging',
  ]);
  await writeRuntimeFirebaseConfig(reservations);

  const emulatorEnvironment = {
    ...process.env,
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    E2E_APP_PORT: String(reservations.app.port),
    E2E_AUTH_PORT: String(reservations.auth.port),
    E2E_FIRESTORE_PORT: String(reservations.firestore.port),
    E2E_STORAGE_PORT: String(reservations.storage.port),
    E2E_FUNCTIONS_PORT: String(reservations.functions.port),
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    VITE_FIREBASE_AUTH_EMULATOR_PORT: String(reservations.auth.port),
    VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: String(reservations.firestore.port),
    VITE_FIREBASE_STORAGE_EMULATOR_PORT: String(reservations.storage.port),
    VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: String(reservations.functions.port),
    VITE_FIREBASE_API_KEY: 'demo-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-watershed.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-watershed',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-watershed.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
    VITE_FIREBASE_MEASUREMENT_ID: 'G-0000000000',
    VITE_RECAPTCHA_SITE_KEY: 'unused-in-emulator',
    VITE_LOCAL_EMAIL_AUTO_VERIFY: localPreview ? 'true' : 'false',
    XDG_CONFIG_HOME: firebaseConfigHome,
    APPDATA: firebaseConfigHome,
  };

  // Build with the emulator configuration before serving the generated assets.
  // This makes E2E exercise the same optimized bundle that Hosting receives.
  await run(npmCommand, ['--prefix', appDir, 'run', 'build'], {
    cwd: repoRoot,
    env: emulatorEnvironment,
  });
  if (localPreview) {
    // Isolate the served demo artifact from subsequent hosted-preview builds.
    await rm(path.join(appDir, '.local-preview-dist'), { recursive: true, force: true });
    await cp(path.join(appDir, 'dist'), path.join(appDir, '.local-preview-dist'), { recursive: true });
  }

  await Promise.all(Object.values(reservations).map(({ release }) => release()));
  reservations = undefined;
  // Firebase owns the lifecycle. Its exec child starts Vite and Playwright;
  // when that child exits, Firebase shuts down every emulator before this
  // runner returns. This prevents Playwright from orphaning the Java process.
  await run(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--config', runtimeFirebaseJson,
    '--project', 'demo-watershed',
    '--only', 'functions,firestore,auth,storage',
    localPreview ? 'node scripts/run-local-preview-suite.mjs' : 'node scripts/run-e2e-suite.mjs',
  ], { cwd: appDir, env: emulatorEnvironment });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (reservations) {
    await Promise.allSettled(Object.values(reservations).map(({ release }) => release()));
  }
  await rm(runtimeFirebaseJson, { force: true });
}
