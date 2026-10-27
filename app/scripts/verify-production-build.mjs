import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(appRoot, 'dist')
const assetExtensions = new Set(['.js', '.css'])
const minifiedAssetPaths = []
const failures = []
const require = createRequire(import.meta.url)
const { version: pdfjsVersion } = require('pdfjs-dist/package.json')

// These are fetched at runtime, so a successful JS bundle is insufficient.
for (const asset of ['standard_fonts/FoxitDingbats.pfb', 'standard_fonts/LiberationSans-Regular.ttf',
  'cmaps/Adobe-Japan1-UCS2.bcmap', 'wasm/jbig2.wasm', 'wasm/jbig2_nowasm_fallback.js',
  'wasm/openjpeg.wasm', 'wasm/openjpeg_nowasm_fallback.js', 'wasm/qcms_bg.wasm']) {
  try {
    const contents = await readFile(path.join(distRoot, 'pdfjs', pdfjsVersion, asset))
    if (!contents.length) failures.push(`PDF runtime asset is empty: ${asset}`)
  } catch {
    failures.push(`Missing PDF runtime asset: ${asset}`)
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      await collectFiles(entryPath)
      continue
    }

    if (entry.name.endsWith('.map')) {
      failures.push(`${path.relative(appRoot, entryPath)} should not ship with a sourcemap`)
      continue
    }

    if (assetExtensions.has(path.extname(entry.name))) {
      minifiedAssetPaths.push(entryPath)
    }
  }
}

try {
  await collectFiles(distRoot)
} catch (error) {
  throw new Error(`Could not inspect production build output at ${distRoot}: ${error.message}`)
}

if (minifiedAssetPaths.length === 0) {
  failures.push('No JavaScript or CSS assets were found in dist')
}

for (const assetPath of minifiedAssetPaths) {
  const contents = await readFile(assetPath, 'utf8')
  const relativePath = path.relative(appRoot, assetPath)

  if (/sourceMappingURL=/.test(contents)) {
    failures.push(`${relativePath} includes a sourcemap reference`)
  }

  const bytes = Buffer.byteLength(contents, 'utf8')
  const lineCount = contents.split(/\r?\n/).length

  if (bytes >= 2048 && lineCount > Math.max(20, Math.ceil(bytes / 512))) {
    failures.push(`${relativePath} has ${lineCount} lines for ${bytes} bytes and does not look minified`)
  }
}

if (failures.length > 0) {
  console.error('Production build minification check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Verified minified production assets: ${minifiedAssetPaths.length} JS/CSS files`)
