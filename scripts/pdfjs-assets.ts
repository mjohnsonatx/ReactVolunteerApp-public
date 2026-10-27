import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

// PDF.js fetches these files by name at runtime; bundling only its worker
// omits fonts, character maps, and the JBIG2/JPEG2000 image decoders.
export function pdfjsAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('pdfjs-dist/package.json');
  const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
  const assets = new Map<string, Buffer>();
  for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
    const sourceDirectory = path.join(path.dirname(packagePath), directory);
    for (const name of readdirSync(sourceDirectory)) {
      // The application renders pages only and does not run PDF scripts.
      if (name.startsWith('quickjs')) continue;
      assets.set(`pdfjs/${version}/${directory}/${name}`, readFileSync(path.join(sourceDirectory, name)));
    }
  }
  return {
    name: 'pdfjs-runtime-assets',
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = new URL(req.url || '/', 'http://localhost').pathname.slice(1);
        const source = assets.get(name);
        if (!source) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm'
          : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(source);
      });
    },
  };
}
