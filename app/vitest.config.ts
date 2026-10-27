import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: fileURLToPath(new URL('../node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('../node_modules/react-dom', import.meta.url)),
      '@runtime/app-context': fileURLToPath(new URL('./src/context/AppContext.tsx', import.meta.url)),
      '@runtime/firebase': fileURLToPath(new URL('./src/firebase.ts', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    // Security-rules tests talk to the emulator, run them via test:rules instead.
    exclude: ['tests/rules/**', 'tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/auth/**',
        'src/hooks/useAuth.ts',
        'src/components/ProfileSetup.tsx',
        'src/components/shared/ForumPostContent.tsx',
        'src/components/modals/NewPostModal.tsx',
        'src/utils/**',
        'src/context/**',
        'src/components/AdminMfaEnrollment.tsx',
        'src/components/DesktopSignIn.tsx',
        'src/components/user/pages/HomePage.tsx',
        'src/components/user/HomeActivity.tsx',
        'src/components/OverlayPanel.tsx',
        'src/components/shared/Markdown.tsx',
        'src/components/modals/AuthModal.tsx',
        'src/components/modals/ChangePasswordModal.tsx',
        'src/components/modals/ChangeEmailModal.tsx',
        'src/components/modals/DeleteAccountModal.tsx',
      ],
    },
  },
});
