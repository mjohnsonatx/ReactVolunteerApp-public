import { logClientErrorFn } from '../libs/callables';
import {
  sanitizeTelemetryExtras,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
} from '@watershed/shared/src/telemetry';

// Never throw from the logger — it must be safe to call from anywhere,
// including error handlers and the error boundary.
export async function logError(error, context = 'unknown', extra = {}) {
  // Always log to console first so you see it locally even if Firestore write fails
  console.error(`[${context}]`, error);

  try {
    await logClientErrorFn({
      context: String(context).slice(0, 100),
      message: sanitizeTelemetryText(error?.message || error || 'Unknown error', 1000),
      stack:   sanitizeTelemetryText(error?.stack || '', 4000),
      url:     sanitizeTelemetryUrl(typeof window !== 'undefined' ? window.location.href : ''),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      extra: sanitizeTelemetryExtras(extra),
    });
  } catch (e) {
    console.warn('Failed to log error remotely', e);
  }
}
