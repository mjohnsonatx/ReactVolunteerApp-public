import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(path.join(root, 'firebase.config.json'), 'utf8'));
const payload = {
  region: cfg.region,
  emulatorProjectId: cfg.emulatorProjectId,
  desktopAppId: cfg.desktopAppId,
};
const out = `// AUTO-GENERATED from firebase.config.json — do not edit.\n` +
  `export const runtimeConfig = ${JSON.stringify(payload, null, 2)} as const;\n`;
writeFileSync(path.join(root, 'functions/src/generatedConfig.ts'), out);
console.log('Wrote functions/src/generatedConfig.ts from firebase.config.json');
