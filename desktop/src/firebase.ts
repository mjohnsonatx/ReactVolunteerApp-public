// desktop/src/firebase.ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithCustomToken } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import {
  CustomProvider,
  getToken as getAppCheckToken,
  initializeAppCheck,
  setTokenAutoRefreshEnabled,
  type AppCheck,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_DESKTOP_APP_ID || import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: inMemoryPersistence });
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
if (useEmulators) {
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
}

const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
const TOKEN_ENDPOINT = import.meta.env.VITE_APPCHECK_TOKEN_ENDPOINT
  || `https://${functionsRegion}-${firebaseConfig.projectId}.cloudfunctions.net/issueDesktopAppCheckToken`;

let appCheck: AppCheck | null = null;
let browserToken: { token: string; expireTimeMillis: number } | null = null;
let previousAttestation: string | null = null;

export async function signInFromBrowser(): Promise<void> {
  const credential = await window.desktop.signIn();
  browserToken = { token: credential.appCheckToken, expireTimeMillis: credential.expiresAt };
  previousAttestation = credential.appCheckToken;
  try {
    await initDesktopAppCheck();
    await signInWithCustomToken(auth, credential.customToken);
  }
  finally { browserToken = null; }
}

export class DesktopAppCheckError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly serverCode?: string,
  ) {
    super(message);
    this.name = 'DesktopAppCheckError';
  }
}

// Seed before the custom Auth token exchange; the admin gate can call this again.
// The emulator suite runs with enforceAppCheck off, so this is a no-op there.
export async function initDesktopAppCheck(): Promise<AppCheck | null> {
  if (useEmulators) return null;
  if (!appCheck) {
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          if (browserToken && browserToken.expireTimeMillis > Date.now()) return browserToken;
          if (!previousAttestation) throw new Error('Sign in with your browser to verify this application.');
          const activeUser = auth.currentUser;
          if (!activeUser) throw new Error('An administrator must be signed in.');
          const idToken = await activeUser.getIdToken();
          const res = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': previousAttestation },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null) as { error?: unknown } | null;
            const serverCode = typeof body?.error === 'string' ? body.error : undefined;
            throw new DesktopAppCheckError(
              `Desktop App Check token exchange failed with HTTP ${res.status}${serverCode ? ` (${serverCode})` : ''}.`,
              res.status,
              serverCode,
            );
          }
          const data = await res.json();
          previousAttestation = data.token;
          return { token: data.token, expireTimeMillis: Date.now() + data.ttlMillis };
        },
      }),
      isTokenAutoRefreshEnabled: false,
    });
  }
  await getAppCheckToken(appCheck);
  setTokenAutoRefreshEnabled(appCheck, true);
  return appCheck;
}
