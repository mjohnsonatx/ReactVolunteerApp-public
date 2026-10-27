import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.FIREBASE_PROJECT_ID || 'tillerystreettrail';
const functions = require('../functions/lib/functions/src/index.js');
const names = Object.keys(functions);
const batches = Array.from({ length: Math.ceil(names.length / 10) }, (_, i) => names.slice(i * 10, (i + 1) * 10));
const startArgument = process.argv.find(a => a.startsWith('--start-batch='));
const start = startArgument ? Number(startArgument.split('=')[1]) : 1;
const stopArgument = process.argv.find(a => a.startsWith('--stop-batch='));
const stop = stopArgument ? Number(stopArgument.split('=')[1]) : batches.length;
assert.ok(Number.isInteger(start) && start >= 1 && start <= batches.length, 'Invalid start batch');
assert.ok(Number.isInteger(stop) && stop >= start && stop <= batches.length, 'Invalid stop batch');
assert.equal(names.length, 84, 'Review the inventory before deployment');
const cli = path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js');
for (let i = start - 1; i < stop; i++) {
  const args = [cli, 'deploy', '--project', project, '--only', batches[i].map(name => `functions:${name}`).join(','), '--non-interactive'];
  console.log(`Batch ${i + 1}/${batches.length}: ${batches[i].join(', ')}`);
  if (!process.argv.includes('--apply')) continue;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root, stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' },
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Batch ${i + 1} failed (${code}); inspect before resuming with --start-batch=${i + 1}`)));
  });
}
