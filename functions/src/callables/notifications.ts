import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { requireAdmin, requireAuth, requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { requireActiveUserProfile } from '../lib/userProfile';
import { recordAdminAction } from '../lib/adminAudit';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { siteUrl } from '../lib/environment';
import { pushTokenId, storedPreferences, SETTINGS, TOKENS } from '../lib/notify';
import {
  createMailer, emailConfigRef, emailSecrets, loadEmailConfig, mailFailure, smtpConfigured, smtpKey,
} from '../lib/mailer';
import {
  buildTestEmail, isValidPushToken, sanitizeEmail, sanitizeNotificationPreferences, sanitizeSenderName,
  MAX_PUSH_TOKENS_PER_USER,
} from '../shared';

const notifyCallableOptions = { ...callableOptions, serviceAccount: runtimeIdentity.notify };
const emailSecretCallableOptions = { ...notifyCallableOptions, secrets: emailSecrets };

function requirePushToken(value: unknown): string {
  if (!isValidPushToken(value)) throw new HttpsError('invalid-argument', 'Invalid notification token.');
  return value;
}

export const getNotificationSettings = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  const [settings, config, devices] = await Promise.all([
    db.collection(SETTINGS).doc(uid).get(),
    emailConfigRef().get(),
    db.collection(TOKENS).where('uid', '==', uid).count().get(),
  ]);
  return {
    preferences: storedPreferences(settings.data()),
    digestAvailable: config.data()?.digestEnabled === true && !!sanitizeEmail(config.data()?.senderAddress),
    pushDevices: devices.data().count,
  };
});

export const saveNotificationSettings = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `notificationSettings:${uid}`, max: 30, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);
  const preferences = sanitizeNotificationPreferences(request.data?.preferences);
  await db.collection(SETTINGS).doc(uid).set({ uid, ...preferences, updatedAt: FieldValue.serverTimestamp() });
  return { preferences };
});

// One document per browser registration, keyed by a hash of the token so the
// token itself never appears in a document path or log line.
export const registerPushToken = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `pushToken:${uid}`, max: 20, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);
  const token = requirePushToken(request.data?.token);
  const ref = db.collection(TOKENS).doc(pushTokenId(token));
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    // A shared browser that signs into another account moves to that account.
    tx.set(ref, {
      uid,
      token,
      createdAt: existing.exists && existing.data()?.uid === uid ? existing.data()?.createdAt : FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  });

  const mine = await db.collection(TOKENS).where('uid', '==', uid).get();
  if (mine.size > MAX_PUSH_TOKENS_PER_USER) {
    const seen = (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data().lastSeenAt?.toMillis?.() ?? 0;
    const oldest = mine.docs.filter(doc => doc.id !== ref.id).sort((a, b) => seen(a) - seen(b))
      .slice(0, mine.size - MAX_PUSH_TOKENS_PER_USER);
    const batch = db.batch();
    oldest.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  return { ok: true };
});

export const unregisterPushToken = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  await enforceRateLimit({ key: `pushToken:${uid}`, max: 20, windowSeconds: 3600 });
  const ref = db.collection(TOKENS).doc(pushTokenId(requirePushToken(request.data?.token)));
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists && existing.data()?.uid === uid) tx.delete(ref);
  });
  return { ok: true };
});

// Administrators manage the sender address and the digest switch here. The
// The Brevo SMTP key is never accepted or returned: it lives in Secret Manager.
export const getEmailDeliverySettings = onCall(emailSecretCallableOptions, async (request) => {
  requireAdmin(request);
  const config = await loadEmailConfig();
  return { ...config, smtpConfigured: smtpConfigured() };
});

export const saveEmailDeliverySettings = onCall(notifyCallableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `emailDeliverySettings:${uid}`, max: 30, windowSeconds: 3600 });
  const rawAddress = typeof request.data?.senderAddress === 'string' ? request.data.senderAddress.trim() : '';
  const senderAddress = sanitizeEmail(rawAddress);
  if (rawAddress && !senderAddress) throw new HttpsError('invalid-argument', 'Enter a valid sender email address.');
  const digestEnabled = request.data?.digestEnabled === true;
  if (digestEnabled && !senderAddress) throw new HttpsError('invalid-argument', 'Enter the verified sender address first.');
  const senderName = sanitizeSenderName(request.data?.senderName) || 'WatershedCrew';

  await emailConfigRef().set({
    senderAddress, senderName, digestEnabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
  }, { merge: true });
  await recordAdminAction(request, {
    action: 'email-delivery.update', summary: 'Updated digest email settings', resourceType: 'email-delivery',
    details: { senderAddress, digestEnabled },
  });
  return { senderAddress, senderName, digestEnabled };
});

export const sendTestEmail = onCall(emailSecretCallableOptions, async (request) => {
  const { uid, token } = requireAdmin(request);
  await enforceRateLimit({ key: `testEmail:${uid}`, max: 5, windowSeconds: 3600 });
  const to = sanitizeEmail(token.email);
  if (!to) throw new HttpsError('failed-precondition', 'Your administrator account has no email address.');
  const config = await loadEmailConfig();
  if (!config.senderAddress) throw new HttpsError('failed-precondition', 'Save the verified sender address first.');
  if (!smtpConfigured()) {
    throw new HttpsError('failed-precondition', 'The Brevo SMTP login or key is not configured. See docs/NOTIFICATIONS.md.');
  }
  try {
    await createMailer(config, smtpKey()).send(to, buildTestEmail(siteUrl));
  } catch (error) {
    throw mailFailure(error);
  }
  await recordAdminAction(request, {
    action: 'email-delivery.test', summary: 'Sent a test email', resourceType: 'email-delivery',
  });
  return { to };
});
