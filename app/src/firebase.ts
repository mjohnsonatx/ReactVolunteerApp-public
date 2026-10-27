import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';

function emulatorPort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

const authEmulatorPort = emulatorPort(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT, 9099);
const firestoreEmulatorPort = emulatorPort(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT, 8080);
const functionsEmulatorPort = emulatorPort(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT, 5001);
const storageEmulatorPort = emulatorPort(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT, 9199);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (useEmulators && !globalThis.__WATERSHED_FIREBASE_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${authEmulatorPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, firestoreEmulatorPort);
  connectFunctionsEmulator(functions, emulatorHost, functionsEmulatorPort);
  connectStorageEmulator(storage, emulatorHost, storageEmulatorPort);
  globalThis.__WATERSHED_FIREBASE_EMULATORS_CONNECTED__ = true;
}

// Debug token only applies to real (non-emulated) local dev.
if (import.meta.env.DEV && !useEmulators) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
}
export const appCheck = useEmulators
  ? null
  : initializeAppCheck(app, {
      provider: import.meta.env.VITE_RECAPTCHA_PROVIDER === 'enterprise'
        ? new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY)
        : new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
if (import.meta.env.DEV && appCheck) {
  getToken(appCheck, true).catch((err) => {
    console.warn('Firebase App Check token refresh failed.', err);
  });
}


// The credential handoff page intentionally has no analytics or third-party tracking.
export const analytics = useEmulators || !firebaseConfig.measurementId || window.location.pathname === '/desktop-sign-in' ? null : getAnalytics(app);
export default app;
