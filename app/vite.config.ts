import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { pdfjsAssets } from '../scripts/pdfjs-assets'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: {
    alias: {
      '@runtime/app-context': fileURLToPath(new URL('./src/context/AppContext.tsx', import.meta.url)),
      '@runtime/firebase': fileURLToPath(new URL('./src/firebase.ts', import.meta.url)),
    },
  },
  build: {
    minify: 'oxc',
    cssMinify: 'lightningcss',
    sourcemap: false,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'initial-vendor',
              test: /node_modules[\\/]/,
              tags: ['$initial'],
              minSize: 100_000,
              maxSize: 350_000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [
        path.dirname(fileURLToPath(import.meta.url)),
        fileURLToPath(new URL('../shared/', import.meta.url)),
        fileURLToPath(new URL('../node_modules/', import.meta.url)),
      ],
    },
  }
})
