import { logError } from './logError';

// Crash/error reporting shim.
//
// Firebase Crashlytics has no Web SDK (it is Android/iOS/Unity only), so the
// web app funnels the same signal into the existing `logClientError` callable,
// which persists to the admin-readable `errorLogs` collection. Keeping this
// wrapper in one place means swapping in a real Crashlytics/Sentry transport
// later is a single-file change.
export type CrashContext = Record<string, unknown>;

export function recordCrash(error: unknown, context: string, extra: CrashContext = {}): void {
  // logError never throws; it is safe to fire-and-forget from UI handlers.
  void logError(error, context, {
    feature: 'crash',
    ...extra,
  });
}

export function recordHandledError(error: unknown, context: string, extra: CrashContext = {}): void {
  void logError(error, context, extra);
}
