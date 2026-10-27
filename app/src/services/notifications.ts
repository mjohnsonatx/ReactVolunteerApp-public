import app from '../firebase';
import {
  callableErrorMessage,
  getNotificationSettingsFn,
  registerPushTokenFn,
  saveNotificationSettingsFn,
  unregisterPushTokenFn,
} from '../libs/callables';
import { sanitizeNotificationPreferences, type NotificationPreferences } from '@watershed/shared';

// The registration token for this browser, kept so it can be removed again on
// "turn off" or sign-out. Push delivery itself is tracked server-side.
const TOKEN_KEY = 'watershed.pushToken';
const SERVICE_WORKER_URL = '/sw.js';

export type PushSupport = 'supported' | 'needs-install' | 'denied' | 'unsupported' | 'not-configured';

function storedToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function storeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage may be blocked; push still works until sign-out */ }
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const vapidKey = () => import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export function pushSupport(): PushSupport {
  if (!vapidKey() || import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') return 'not-configured';
  // iPhone and iPad only allow web push for sites added to the Home Screen.
  if (isIos() && !isInstalledApp()) return 'needs-install';
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'supported';
}

export function isPushEnabledOnThisDevice(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!storedToken();
}

async function messagingToken(): Promise<string> {
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!await isSupported()) throw new Error('This browser does not support push notifications.');
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  return getToken(getMessaging(app), { vapidKey: vapidKey(), serviceWorkerRegistration: registration });
}

/** Must be called from a click: browsers only show the permission prompt for a user gesture. */
export async function enablePushOnThisDevice(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
      : 'Notification permission was not granted.');
  }
  const token = await messagingToken();
  if (!token) throw new Error('Could not register this device for notifications.');
  await registerPushTokenFn({ token });
  storeToken(token);
}

/** Re-registers a token that the browser rotated since it was saved. */
export async function refreshPushRegistration(): Promise<void> {
  if (!isPushEnabledOnThisDevice() || pushSupport() !== 'supported') return;
  const token = await messagingToken();
  if (token && token !== storedToken()) {
    await registerPushTokenFn({ token });
    await unregisterPushTokenFn({ token: storedToken() }).catch(() => {});
    storeToken(token);
  }
}

export async function disablePushOnThisDevice(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  storeToken('');
  await unregisterPushTokenFn({ token }).catch(() => {});
  try {
    const { deleteToken, getMessaging } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* the server registration is already gone */ }
}

export type NotificationSettings = {
  preferences: NotificationPreferences;
  digestAvailable: boolean;
  pushDevices: number;
};

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await getNotificationSettingsFn();
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    preferences: sanitizeNotificationPreferences(result.preferences),
    digestAvailable: result.digestAvailable === true,
    pushDevices: Number(result.pushDevices) || 0,
  };
}

export async function saveNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
  const { data } = await saveNotificationSettingsFn({ preferences });
  return sanitizeNotificationPreferences((data as { preferences?: unknown })?.preferences);
}

export function notificationErrorMessage(err: unknown, fallback: string): string {
  const callable = callableErrorMessage(err, '');
  if (callable) return callable;
  return err instanceof Error && err.message && !('code' in err) ? err.message : fallback;
}
