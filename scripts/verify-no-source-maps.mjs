import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const directories = process.argv.slice(2).map(directory => path.resolve(directory));
if (directories.length === 0) {
  console.error('Usage: node scripts/verify-no-source-maps.mjs <directory> [...]');
  process.exit(2);
}

const inspectableExtensions = new Set(['.js', '.mjs', '.cjs', '.css']);
const failures = [];
let inspected = 0;

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(entryPath);
      continue;
    }

    inspected += 1;
    if (entry.name.endsWith('.map')) {
      failures.push(`source map emitted: ${path.relative(process.cwd(), entryPath)}`);
      continue;
    }

    if (!inspectableExtensions.has(path.extname(entry.name))) continue;
    const contents = await readFile(entryPath, 'utf8');
    if (/sourceMappingURL=/.test(contents)) {
      failures.push(`source map reference emitted: ${path.relative(process.cwd(), entryPath)}`);
    }
  }
}

for (const directory of directories) {
  try {
    await inspect(directory);
  } catch (error) {
    failures.push(`could not inspect ${path.relative(process.cwd(), directory)}: ${error.message}`);
  }
}

if (inspected === 0) failures.push('no build artifacts were found');
if (failures.length > 0) {
  console.error('Source map verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Verified ${inspected} build artifacts without source maps.`);
