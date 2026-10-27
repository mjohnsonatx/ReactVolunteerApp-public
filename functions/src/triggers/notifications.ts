import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { runtimeConfig } from '../generatedConfig';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { siteUrl } from '../lib/environment';
import { adminAuth, db } from '../lib/firebaseAdmin';
import {
  dispatchNotification, deliver, preferencesFor, subscribersFor, DIGEST_ITEMS,
} from '../lib/notify';
import {
  acquireNotificationLease, assertNotificationLease, checkNotificationLease, finishNotificationLease,
  NOTIFICATION_TIMEOUT_SECONDS, type NotificationLease,
} from '../lib/notificationLease';
import {
  createMailer, emailSecrets, loadEmailConfig, recordDigestRun, smtpConfigured, smtpKey,
} from '../lib/mailer';
import {
  addedReplies, buildDigestEmail, eventMessage, forumAuthorKey, forumPostMessage, forumReplyMessage,
  replyRecipients, DIGEST_SCHEDULE, DIGEST_TIME_ZONE, NOTIFICATION_TOPICS,
  type DigestItem, type NotificationTopic,
} from '../shared';

const triggerOptions = {
  region: runtimeConfig.region, serviceAccount: runtimeIdentity.notify,
  timeoutSeconds: NOTIFICATION_TIMEOUT_SECONDS,
};

// Brevo's free plan allows 300 sends/day; leave room for admin test messages.
const MAX_DIGEST_EMAILS_PER_RUN = 250;
const STALE_DIGEST_ITEM_MS = 3 * 24 * 60 * 60 * 1000;

type ForumReply = { id: string; authorId?: string; author?: string; text?: string };

/** Real account ids for anonymous posts/replies, keyed by forumAuthorKey. */
async function anonymousAuthors(postId: string): Promise<Map<string, string>> {
  const snap = await db.collection('forumAuthors').where('postId', '==', postId).get();
  const identities = new Map<string, string>();
  for (const doc of snap.docs) {
    const { replyId, authorId } = doc.data();
    if (typeof authorId === 'string') identities.set(forumAuthorKey(postId, typeof replyId === 'string' ? replyId : ''), authorId);
  }
  return identities;
}

// Fires on every forum write (votes included) but returns early unless a post
// was just approved or an approved post gained replies. Pending replies live
// outside the post until an admin approves them, so they announce on approval.
export const notifyForumActivity = onDocumentWritten(
  { ...triggerOptions, document: 'forumPosts/{postId}', retry: true },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;
    const post = after.data() ?? {};
    if (post.status !== 'approved') return;

    const postId = event.params.postId;
    const wasApproved = before?.exists === true && before.data()?.status === 'approved';
    const newReplies = wasApproved ? addedReplies<ForumReply>(before?.data()?.replies, post.replies) : [];
    if (wasApproved && !newReplies.length) return;

    const needsIdentities = post.anonymous === true
      || (Array.isArray(post.replies) && post.replies.some((reply: { anonymous?: unknown }) => reply?.anonymous === true));
    const identities = needsIdentities ? await anonymousAuthors(postId) : new Map<string, string>();
    const postAuthorId: string | undefined = post.authorId || identities.get(forumAuthorKey(postId));

    if (!wasApproved) {
      await dispatchNotification(`post_${postId}`, async lease => {
        await deliver(forumPostMessage(postId, post.title, post.author), await subscribersFor('forumPosts'), lease, [postAuthorId]);
      });
      return;
    }

    const replies: ForumReply[] = Array.isArray(post.replies) ? post.replies : [];
    const authorOf = (reply: ForumReply) => reply?.authorId || identities.get(forumAuthorKey(postId, reply?.id));
    for (const reply of newReplies) {
      const earlier = replies.slice(0, Math.max(0, replies.findIndex(r => r?.id === reply.id))).map(authorOf);
      const recipients = replyRecipients([postAuthorId, ...earlier], authorOf(reply));
      if (!recipients.length) continue;
      await dispatchNotification(`reply_${postId}_${reply.id}`, async lease => {
        await deliver(forumReplyMessage(postId, post.title, reply.author, reply.text), await preferencesFor(recipients), lease);
      });
    }
  },
);

export const notifyNewEvent = onDocumentCreated(
  { ...triggerOptions, document: 'events/{eventId}', retry: true },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const eventId = event.params.eventId;
    await dispatchNotification(`event_${eventId}`, async lease => {
      await deliver(eventMessage(eventId, data), await subscribersFor('events'), lease);
    });
  },
);

async function deleteRefs(refs: FirebaseFirestore.DocumentReference[], lease: NotificationLease): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    await db.runTransaction(async tx => {
      await assertNotificationLease(tx, lease);
      refs.slice(i, i + 400).forEach(ref => tx.delete(ref));
    });
  }
}

export async function runDailyDigest(): Promise<{ status: string; sent: number; failed: number }> {
  // Take the lock BEFORE reading the queue. A worker that read a stale snapshot
  // must not send it after another worker has already drained those items.
  const lease = await acquireNotificationLease(db.collection('notificationConfig').doc('digestRun'));
  if (typeof lease === 'string') return { status: 'skipped: digest already running', sent: 0, failed: 0 };
  try {
    const result = await sendQueuedDigest(lease);
    await recordDigestRun(result.status, result.sent, result.failed, lease);
    return result;
  } finally {
    await finishNotificationLease(lease, false);
  }
}

async function sendQueuedDigest(lease: NotificationLease): Promise<{ status: string; sent: number; failed: number }> {
  const stale = await db.collection(DIGEST_ITEMS)
    .where('createdAt', '<', Timestamp.fromMillis(Date.now() - STALE_DIGEST_ITEM_MS)).limit(2000).get();
  await deleteRefs(stale.docs.map(doc => doc.ref), lease);

  const config = await loadEmailConfig();
  if (!config.digestEnabled || !config.senderAddress) return { status: 'skipped: digest is turned off', sent: 0, failed: 0 };
  if (!smtpConfigured()) return { status: 'skipped: the Brevo SMTP login or key is not set', sent: 0, failed: 0 };

  const queued = await db.collection(DIGEST_ITEMS)
    .where('createdAt', '<=', Timestamp.now()).orderBy('createdAt').limit(5000).get();
  const byMember = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of queued.docs) {
    const uid = doc.data().uid;
    if (typeof uid !== 'string') continue;
    byMember.set(uid, [...(byMember.get(uid) ?? []), doc]);
  }
  if (!byMember.size) return { status: 'nothing to send', sent: 0, failed: 0 };

  const preferences = await preferencesFor([...byMember.keys()]);
  const mailer = createMailer(config, smtpKey());
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const [uid, docs] of byMember) {
    if (sent >= MAX_DIGEST_EMAILS_PER_RUN) { deferred++; continue; }
    // Re-check the member's current choices: they may have turned a topic off since it was queued.
    const items: DigestItem[] = docs.map(doc => doc.data()).filter(item => (
      (NOTIFICATION_TOPICS as readonly string[]).includes(item.topic)
      && preferences.get(uid)?.[item.topic as NotificationTopic].digest === true
    )).map(item => ({ topic: item.topic, title: String(item.title), body: String(item.body), link: String(item.link) }));
    const refs = docs.map(doc => doc.ref);
    if (!items.length) { await deleteRefs(refs, lease); continue; }

    const user = await adminAuth.getUser(uid).catch((error) => {
      if (error?.code === 'auth/user-not-found') return null;
      throw error;
    });
    if (!user || user.disabled || !user.email || !user.emailVerified) { await deleteRefs(refs, lease); continue; }

    try {
      await checkNotificationLease(lease);
      // SMTP cannot join the Firestore transaction. A crash after acceptance
      // but before queue removal can still duplicate an email on recovery.
      await mailer.send(user.email, buildDigestEmail(items, siteUrl));
      sent++;
      await deleteRefs(refs, lease);
    } catch (error) {
      failed++;
      logger.error('Digest email failed', { uid, code: (error as { code?: unknown })?.code ?? null });
      if ((error as { code?: unknown })?.code === 'EAUTH') break; // Every send would fail the same way.
    }
  }
  const status = failed ? 'completed with failures' : deferred ? `sent; ${deferred} held for tomorrow (daily limit)` : 'sent';
  return { status, sent, failed };
}

export const sendDailyDigest = onSchedule(
  {
    ...triggerOptions,
    schedule: DIGEST_SCHEDULE,
    timeZone: DIGEST_TIME_ZONE,
    secrets: emailSecrets,
    retryCount: 0,
  },
  async () => {
    const result = await runDailyDigest();
    logger.info('Daily digest finished', result);
  },
);
