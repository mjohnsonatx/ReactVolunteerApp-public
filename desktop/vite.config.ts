import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { pdfjsAssets } from '../scripts/pdfjs-assets';

export default {
  envDir: '../app',
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../app/src'),
      '@runtime/app-context': path.resolve(__dirname, 'src/context/AppContext.tsx'),
      '@runtime/firebase': path.resolve(__dirname, 'src/firebase.ts'),
    },
    dedupe: ['react', 'react-dom', 'firebase'],
  },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../app'), path.resolve(__dirname, '../shared'), path.resolve(__dirname, '../node_modules')],
    },
  },
  plugins: [
    react(),
    pdfjsAssets(),
    electron({
      main: { entry: 'electron/main.ts', vite: { build: { sourcemap: false } } },
      preload: { input: 'electron/preload.ts', vite: { build: { sourcemap: false } } },
    }) as any,
  ],
  base: './',
  build: { sourcemap: false },
};
