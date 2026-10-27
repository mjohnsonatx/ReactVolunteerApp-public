import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../app/src'),
      '@runtime/app-context': path.resolve(__dirname, 'src/context/AppContext.tsx'),
      '@runtime/firebase': path.resolve(__dirname, 'src/firebase.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
