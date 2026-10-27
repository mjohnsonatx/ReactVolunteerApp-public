// Temporary launch gate while PDF rendering is investigated. Both Hosting
// preview and live releases use production builds, so this cannot be enabled
// by a URL, local storage, or a client-side setting. Keep local development
// available for repairs; admin document/storage maintenance is independent.
// This is a product gate, not a replacement for Firebase access controls.
export const PUBLIC_DOCUMENTS_ENABLED = import.meta.env.DEV;

export const DEVELOPMENT_PREVIEW = import.meta.env.VITE_FIREBASE_PROJECT_ID === 'tillerystreettrail-dev';

// Never enabled on hosted previews or production, even if one flag is set wrong.
export const LOCAL_EMAIL_TEST_MODE = import.meta.env.VITE_LOCAL_EMAIL_AUTO_VERIFY === 'true'
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  && import.meta.env.VITE_FIREBASE_PROJECT_ID === 'demo-watershed'
  && import.meta.env.VITE_FIREBASE_EMULATOR_HOST === '127.0.0.1';
