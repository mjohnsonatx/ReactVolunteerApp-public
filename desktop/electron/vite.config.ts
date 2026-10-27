// desktop/vite.config.ts
import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const appSrc = normalizePath(path.resolve(__dirname, '../app/src'));
const desktopSrc = normalizePath(path.resolve(__dirname, 'src'));

// When shared web code imports these modules, hand it the desktop versions.
// Keys are extensionless so firebase.ts / firebase.js / AppContext.jsx all match.
const substitutions = new Map<string, string>([
  [`${appSrc}/firebase`, `${desktopSrc}/firebase.ts`],
  [`${appSrc}/context/AppContext`, `${desktopSrc}/context/AppContext.tsx`],
]);

function substituteAppModules(): Plugin {
  return {
    name: 'desktop:substitute-app-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !normalizePath(importer).startsWith(appSrc)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const key = normalizePath(resolved.id.split('?')[0]).replace(/\.(tsx?|jsx?)$/, '');
      return substitutions.get(key) ?? null;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [substituteAppModules(), react()],
  resolve: {
    alias: { '@app': appSrc, '@desktop': desktopSrc },
    // One copy of React and Firebase, otherwise you get duplicate React
    // instances or "component not registered" errors from Firebase.
    dedupe: ['react', 'react-dom', 'firebase'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname), appSrc, path.resolve(__dirname, '../shared'), path.resolve(__dirname, '../node_modules')],
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
