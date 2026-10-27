import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const readJson = (relativePath) => JSON.parse(
  readFileSync(path.join(repoRoot, relativePath), 'utf8'),
);

const config = readJson('firebase.config.json');
const firebaseJson = readJson('firebase.json');
const functionsPackage = readJson('functions/package.json');
const checks = ['auth', 'firestore', 'storage', 'functions', 'hosting'];
let failed = false;

for (const key of checks) {
  const expected = config.emulators[key]?.port;
  const actual = firebaseJson.emulators?.[key]?.port;
  if (expected !== actual) {
    console.error(`[config drift] emulators.${key}.port: firebase.config.json=${expected} firebase.json=${actual}`);
    failed = true;
  }
}

const expectedUiEnabled = config.emulators.ui?.enabled;
const actualUiEnabled = firebaseJson.emulators?.ui?.enabled;
if (expectedUiEnabled !== actualUiEnabled) {
  console.error(`[config drift] emulators.ui.enabled: firebase.config.json=${expectedUiEnabled} firebase.json=${actualUiEnabled}`);
  failed = true;
}

const nodeMajor = functionsPackage.engines?.node;
const expectedRuntime = nodeMajor ? `nodejs${nodeMajor}` : undefined;
const functionsConfigs = Array.isArray(firebaseJson.functions) ? firebaseJson.functions : [firebaseJson.functions];
for (const functionsConfig of functionsConfigs.filter(Boolean)) {
  if (functionsConfig.runtime !== expectedRuntime) {
    console.error(`[config drift] functions runtime: functions/package.json=${nodeMajor} firebase.json=${functionsConfig.runtime}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nfirebase.json, firebase.config.json, and Functions runtime configuration have drifted.');
  process.exit(1);
}

console.log(`Firebase emulator config is in sync; Functions uses ${expectedRuntime}.`);
