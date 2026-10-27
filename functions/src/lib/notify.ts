import { createHash } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './firebaseAdmin';
import { emailConfigRef } from './mailer';
import {
  acquireNotificationLease, assertNotificationLease, checkNotificationLease, finishNotificationLease,
  NOTIFICATION_RETENTION_MS, type NotificationLease,
} from './notificationLease';
import {
  sanitizeNotificationPreferences,
  type NotificationMessage,
  type NotificationPreferences,
  type NotificationTopic,
} from '../shared';

// Collections. All are server-only; Firestore rules deny every client.
//   notificationSettings/{uid}: the member's per-topic push/digest choices.
//   notificationTokens/{sha256(token)}: one browser/device push registration.
//   notificationDigestItems/{id}: queued lines for tonight's digest email.
//   notificationDispatches/{key}: activity leases and completed delivery receipts.
export const SETTINGS = 'notificationSettings';
export const TOKENS = 'notificationTokens';
export const DIGEST_ITEMS = 'notificationDigestItems';
const DISPATCHES = 'notificationDispatches';

const DAY_MS = 24 * 60 * 60 * 1000;
const DIGEST_ITEM_TTL_DAYS = 3;

export const pushTokenId = (token: string) => createHash('sha256').update(token).digest('hex');

export function storedPreferences(data: FirebaseFirestore.DocumentData | undefined): NotificationPreferences {
  return sanitizeNotificationPreferences(data);
}

/** Completion is recorded after delivery; failed and abandoned work is retryable. */
export async function dispatchNotification(key: string, work: (lease: NotificationLease) => Promise<void>): Promise<void> {
  const id = key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300);
  const lease = await acquireNotificationLease(db.collection(DISPATCHES).doc(id), true);
  if (lease === 'complete') return;
  // Do not acknowledge a competing event while its owner could still fail.
  if (lease === 'busy') throw new Error('Notification dispatch is already processing. Retry the event.');
  try {
    await work(lease);
    await finishNotificationLease(lease, true);
  } catch (error) {
    await finishNotificationLease(lease, false).catch(() => {});
    throw error;
  }
}

function receiptRef(lease: NotificationLease, channel: string, recipient: string) {
  const id = createHash('sha256').update(JSON.stringify([lease.ref.id, channel, recipient])).digest('hex');
  return db.collection(DISPATCHES).doc(`receipt_${id}`);
}

const receiptData = () => ({ state: 'complete', expireAt: Timestamp.fromMillis(Date.now() + NOTIFICATION_RETENTION_MS) });

export async function preferencesFor(uids: string[]): Promise<Map<string, NotificationPreferences>> {
  const result = new Map<string, NotificationPreferences>();
  const unique = [...new Set(uids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map(uid => db.collection(SETTINGS).doc(uid));
    for (const snap of await db.getAll(...refs)) {
      if (snap.exists) result.set(snap.id, storedPreferences(snap.data()));
    }
  }
  return result;
}

/** Everyone who opted into a topic on either channel. */
export async function subscribersFor(topic: NotificationTopic): Promise<Map<string, NotificationPreferences>> {
  const [push, digest] = await Promise.all([
    db.collection(SETTINGS).where(`${topic}.push`, '==', true).get(),
    db.collection(SETTINGS).where(`${topic}.digest`, '==', true).get(),
  ]);
  const result = new Map<string, NotificationPreferences>();
  for (const snap of [...push.docs, ...digest.docs]) result.set(snap.id, storedPreferences(snap.data()));
  return result;
}

const UNREGISTERED_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export async function sendPush(uids: string[], message: NotificationMessage, lease: NotificationLease): Promise<number> {
  const tokens: Array<{ ref: FirebaseFirestore.DocumentReference; token: string }> = [];
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await db.collection(TOKENS).where('uid', 'in', uids.slice(i, i + 30)).get();
    for (const doc of snap.docs) {
      const token = doc.data().token;
      if (typeof token === 'string') tokens.push({ ref: doc.ref, token });
    }
  }
  let delivered = 0;
  for (let i = 0; i < tokens.length; i += 200) {
    const candidates = tokens.slice(i, i + 200);
    const receipts = await db.getAll(...candidates.map(entry => receiptRef(lease, 'push', entry.token)));
    const chunk = candidates.filter((_, index) => !receipts[index].exists);
    if (!chunk.length) continue;
    await checkNotificationLease(lease);
    // Data-only messages: the site's service worker renders every notification,
    // so wording, icon and click target are identical on every browser.
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk.map(entry => entry.token),
      data: { title: message.title, body: message.body, link: message.link, topic: message.topic },
      webpush: { headers: { TTL: String(DAY_MS / 1000), Urgency: 'normal' } },
    });
    delivered += response.successCount;
    await db.runTransaction(async tx => {
      await assertNotificationLease(tx, lease);
      response.responses.forEach((result, index) => {
        const stale = UNREGISTERED_TOKEN_ERRORS.has(result.error?.code || '');
        if (result.success || stale) tx.set(receiptRef(lease, 'push', chunk[index].token), receiptData());
        if (stale) tx.delete(chunk[index].ref);
      });
    });
    // FCM can resolve with partial failures. Preserve acknowledgements and let
    // the trigger retry only the unacknowledged tokens.
    if (response.responses.some(result => !result.success && !UNREGISTERED_TOKEN_ERRORS.has(result.error?.code || ''))) {
      throw new Error('Some push notifications failed. Retry the event.');
    }
  }
  return delivered;
}

export async function queueDigest(uids: string[], message: NotificationMessage, lease: NotificationLease): Promise<void> {
  const unique = [...new Set(uids)];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    await db.runTransaction(async tx => {
      await assertNotificationLease(tx, lease);
      const receipts = await tx.getAll(...chunk.map(uid => receiptRef(lease, 'digest', uid)));
      chunk.forEach((uid, index) => {
        if (receipts[index].exists) return;
        // The receipt and queue item commit together. Retain the receipt after
        // the digest consumes the item so a dispatch retry cannot enqueue it again.
        tx.create(db.collection(DIGEST_ITEMS).doc(receipts[index].id), {
          uid,
          ...message,
          createdAt: FieldValue.serverTimestamp(),
          expireAt: Timestamp.fromMillis(Date.now() + DIGEST_ITEM_TTL_DAYS * DAY_MS),
        });
        tx.create(receipts[index].ref, receiptData());
      });
    });
  }
}

/** Sends a message to each member on the channels they chose for its topic. */
export async function deliver(
  message: NotificationMessage,
  recipients: Map<string, NotificationPreferences>,
  lease: NotificationLease,
  exclude: Array<string | null | undefined> = [],
): Promise<void> {
  const skipped = new Set(exclude.filter(Boolean));
  const pushUids: string[] = [];
  const digestUids: string[] = [];
  for (const [uid, preferences] of recipients) {
    if (skipped.has(uid)) continue;
    if (preferences[message.topic].push) pushUids.push(uid);
    if (preferences[message.topic].digest) digestUids.push(uid);
  }
  // Nothing is queued while administrators have the digest switched off.
  const digestOn = digestUids.length > 0 && (await emailConfigRef().get()).data()?.digestEnabled === true;
  if (digestOn) await queueDigest(digestUids, message, lease);
  const pushed = pushUids.length ? await sendPush(pushUids, message, lease) : 0;
  logger.info('Notification delivered', {
    topic: message.topic, pushRecipients: pushUids.length, pushDelivered: pushed, digestQueued: digestOn ? digestUids.length : 0,
  });
}
