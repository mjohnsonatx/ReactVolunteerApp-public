import { onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { clientIp } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import {
  sanitizeTelemetryExtras,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
  sanitizeText,
  clientErrorTags,
} from '../shared';

export const logClientError = onCall(callableOptions, async (request) => {
  const uid = request.auth?.uid ?? null;
  const key = uid ? `clientError:${uid}` : `clientError:${clientIp(request)}`;
  await enforceRateLimit({ key, max: 60, windowSeconds: 3600 });

  const context = sanitizeText(request.data?.context).slice(0, 100) || 'unknown';
  const token = request.auth?.token;
  const surface = token?.desktop_admin_mfa === true ? 'desktop' : 'web';
  await db.collection('errorLogs').add({
    type: 'error',
    context,
    message: sanitizeTelemetryText(request.data?.message || 'Unknown error', 1000),
    stack: sanitizeTelemetryText(request.data?.stack, 4000),
    url: sanitizeTelemetryUrl(request.data?.url),
    userAgent: String(request.data?.userAgent || '').slice(0, 500),
    uid,
    actorUid: uid,
    actorEmail: sanitizeText(token?.email).slice(0, 320),
    actorName: sanitizeText(token?.name).slice(0, 120),
    surface,
    tags: [...clientErrorTags(context), surface],
    extra: sanitizeTelemetryExtras(request.data?.extra),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
