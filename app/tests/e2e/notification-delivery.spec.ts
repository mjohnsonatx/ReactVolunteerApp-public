import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Exercise the compiled production handlers against real Firestore transactions.
// Only the external FCM/SMTP transports are replaced; no real messages are sent.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requireBackend = createRequire(path.join(root, 'functions/package.json'));
const compiled = path.join(root, 'functions/lib/functions/src');
let notify: typeof import('../../../functions/src/lib/notify');
let triggers: typeof import('../../../functions/src/triggers/notifications');
let leases: typeof import('../../../functions/src/lib/notificationLease');
let mailer: typeof import('../../../functions/src/lib/mailer');
let backend: typeof import('../../../functions/src/lib/firebaseAdmin');
let messaging: import('firebase-admin/messaging').Messaging;
let originalSend: typeof messaging.sendEachForMulticast;
let originalMailer: typeof mailer.createMailer;
let originalSubscribers: typeof notify.subscribersFor;
let originalConfig: typeof mailer.loadEmailConfig;
let originalTransaction: typeof backend.db.runTransaction;
const uid = 'notification-race-member';
const prefs = { events: { digest: true, push: false } };
const message = { topic: 'events' as const, title: 'New event', body: 'Cleanup', link: '/events/race' };
const { Timestamp } = requireBackend('firebase-admin/firestore');
const previousEmulator = process.env.FUNCTIONS_EMULATOR;
const previousSmtpKey = process.env.BREVO_SMTP_KEY;
const previousSmtpLogin = process.env.BREVO_SMTP_LOGIN;

function event(id: string) {
  return { params: { eventId: id }, data: { data: () => ({ title: 'Cleanup' }) } } as unknown as Parameters<typeof triggers.notifyNewEvent.run>[0];
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function queued() {
  return (await backend.db.collection('notificationDigestItems').get()).docs;
}

test.beforeAll(async () => {
  process.env.GCLOUD_PROJECT = 'demo-watershed';
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-watershed';
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${process.env.E2E_FIRESTORE_PORT || 8080}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${process.env.E2E_AUTH_PORT || 9099}`;
  process.env.FUNCTIONS_EMULATOR = 'true';
  process.env.BREVO_SMTP_KEY = 'emulator-only-placeholder';
  process.env.BREVO_SMTP_LOGIN = 'emulator@example.test';
  backend = requireBackend(path.join(compiled, 'lib/firebaseAdmin.js'));
  notify = requireBackend(path.join(compiled, 'lib/notify.js'));
  triggers = requireBackend(path.join(compiled, 'triggers/notifications.js'));
  leases = requireBackend(path.join(compiled, 'lib/notificationLease.js'));
  mailer = requireBackend(path.join(compiled, 'lib/mailer.js'));
  messaging = requireBackend('firebase-admin/messaging').getMessaging();
  originalSend = messaging.sendEachForMulticast;
  originalMailer = mailer.createMailer;
  originalSubscribers = notify.subscribersFor;
  originalConfig = mailer.loadEmailConfig;
  originalTransaction = backend.db.runTransaction;
  await backend.adminAuth.createUser({ uid, email: 'notification-race@example.test', emailVerified: true });
});

test.beforeEach(async () => {
  const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-watershed/databases/(default)/documents`, { method: 'DELETE' });
  expect(cleared.ok).toBe(true);
  await backend.db.doc('notificationConfig/email').set({ senderAddress: 'sender@example.test', digestEnabled: true });
  await backend.db.doc(`notificationSettings/${uid}`).set(prefs);
  mailer.createMailer = () => ({ send: async () => {} });
  messaging.sendEachForMulticast = async () => { throw new Error('Unexpected FCM transport call in emulator test'); };
});

test.afterEach(() => {
  notify.subscribersFor = originalSubscribers;
  mailer.createMailer = originalMailer;
  mailer.loadEmailConfig = originalConfig;
  messaging.sendEachForMulticast = originalSend;
  backend.db.runTransaction = originalTransaction;
});

test.afterAll(async () => {
  if (previousEmulator === undefined) delete process.env.FUNCTIONS_EMULATOR;
  else process.env.FUNCTIONS_EMULATOR = previousEmulator;
  if (previousSmtpKey === undefined) delete process.env.BREVO_SMTP_KEY;
  else process.env.BREVO_SMTP_KEY = previousSmtpKey;
  if (previousSmtpLogin === undefined) delete process.env.BREVO_SMTP_LOGIN;
  else process.env.BREVO_SMTP_LOGIN = previousSmtpLogin;
  await backend?.adminAuth.deleteUser(uid);
});

test('a failed recipient lookup is retryable instead of permanently acknowledging the event', async () => {
  notify.subscribersFor = async () => { throw new Error('temporary lookup failure'); };
  await expect(triggers.notifyNewEvent.run(event('lookup'))).rejects.toThrow('temporary lookup failure');
  expect((await backend.db.doc('notificationDispatches/event_lookup').get()).data()?.state).toBe('pending');
  notify.subscribersFor = originalSubscribers;
  await triggers.notifyNewEvent.run(event('lookup'));
  await triggers.notifyNewEvent.run(event('lookup'));
  expect(await queued()).toHaveLength(1);
  expect((await backend.db.doc('notificationDispatches/event_lookup').get()).data()?.state).toBe('complete');
});

test('overlapping event workers cannot both deliver and contention remains retryable', async () => {
  const entered = deferred();
  const release = deferred();
  let calls = 0;
  const first = notify.dispatchNotification('concurrent', async () => {
    calls++;
    entered.resolve();
    await release.promise;
  });
  try {
    await entered.promise;
    await expect(notify.dispatchNotification('concurrent', async () => { calls++; })).rejects.toThrow('already processing');
  } finally {
    release.resolve();
    await first;
  }
  await notify.dispatchNotification('concurrent', async () => { calls++; });
  expect(calls).toBe(1);
});

test('expired claims recover and stale owners cannot enqueue, complete, or unlock a replacement', async () => {
  const ref = backend.db.doc('notificationDispatches/takeover');
  const old = await leases.acquireNotificationLease(ref);
  if (typeof old === 'string') throw new Error('expected an acquired lease');
  await ref.update({ leaseUntil: Timestamp.fromMillis(0) });
  const replacement = await leases.acquireNotificationLease(ref);
  if (typeof replacement === 'string') throw new Error('expected a replacement lease');
  await expect(notify.queueDigest([uid], message, old)).rejects.toThrow('lease was lost');
  await leases.finishNotificationLease(old, true);
  await leases.finishNotificationLease(old, false);
  expect((await ref.get()).data()?.owner).toBe(replacement.owner);
  await notify.queueDigest([uid], message, replacement);
  await leases.finishNotificationLease(replacement, true);
  expect(await queued()).toHaveLength(1);
});

test('concurrent digest enqueue writes one receipt and does not recreate a consumed item', async () => {
  await notify.dispatchNotification('queue-once', async lease => {
    await Promise.all([notify.queueDigest([uid, uid], message, lease), notify.queueDigest([uid], message, lease)]);
    expect(await queued()).toHaveLength(1);
    await (await queued())[0].ref.delete();
    await notify.queueDigest([uid], message, lease);
    expect(await queued()).toHaveLength(0);
  });
});

test('partial enqueue failure resumes only uncommitted recipients even after earlier items are consumed', async () => {
  const recipients = Array.from({ length: 205 }, (_, index) => `member-${index}`);
  await expect(notify.dispatchNotification('partial-queue', async lease => {
    let transactions = 0;
    backend.db.runTransaction = ((...args: Parameters<typeof originalTransaction>) => {
      if (++transactions === 2) return Promise.reject(new Error('second queue batch unavailable'));
      return originalTransaction.apply(backend.db, args);
    }) as typeof originalTransaction;
    try { await notify.queueDigest(recipients, message, lease); }
    finally { backend.db.runTransaction = originalTransaction; }
  })).rejects.toThrow('second queue batch unavailable');
  const committed = await queued();
  expect(committed).toHaveLength(200);
  const cleanup = backend.db.batch();
  committed.forEach(doc => cleanup.delete(doc.ref));
  await cleanup.commit();
  await notify.dispatchNotification('partial-queue', lease => notify.queueDigest(recipients, message, lease));
  expect(await queued()).toHaveLength(5);
});

test('partial FCM failures retry only failed tokens without repeating queued or consumed digests', async () => {
  await backend.db.doc(`notificationSettings/${uid}`).set({ events: { digest: true, push: true } });
  await backend.db.doc('notificationTokens/a').set({ uid, token: 'token-a' });
  await backend.db.doc('notificationTokens/b').set({ uid, token: 'token-b' });
  const requests: string[][] = [];
  messaging.sendEachForMulticast = async request => {
    requests.push(request.tokens);
    const responses = request.tokens.map(token => token === 'token-b' && requests.length === 1
      ? { success: false, error: { code: 'messaging/server-unavailable' } }
      : { success: true, messageId: 'local-ack' });
    return { responses, successCount: responses.filter(r => r.success).length, failureCount: responses.filter(r => !r.success).length } as Awaited<ReturnType<typeof originalSend>>;
  };
  await expect(triggers.notifyNewEvent.run(event('partial-push'))).rejects.toThrow('Some push notifications failed');
  expect(await queued()).toHaveLength(1);
  await (await queued())[0].ref.delete();
  await triggers.notifyNewEvent.run(event('partial-push'));
  expect(requests).toEqual([['token-a', 'token-b'], ['token-b']]);
  expect(await queued()).toHaveLength(0);
});

test('overlapping digest runs send one email and read the queue only after acquiring the lock', async () => {
  await triggers.notifyNewEvent.run(event('digest-overlap'));
  const entered = deferred();
  const release = deferred();
  let sent = 0;
  mailer.createMailer = () => ({ send: async () => { sent++; entered.resolve(); await release.promise; } });
  const first = triggers.runDailyDigest();
  try {
    await entered.promise;
    expect(await triggers.runDailyDigest()).toEqual({ status: 'skipped: digest already running', sent: 0, failed: 0 });
    expect(sent).toBe(1);
    expect(await queued()).toHaveLength(1);
  } finally {
    release.resolve();
    expect((await first).sent).toBe(1);
  }
  expect((await triggers.runDailyDigest()).sent).toBe(0);
  expect(sent).toBe(1);
  expect(await queued()).toHaveLength(0);
});

test('failed SMTP leaves the queue retryable and releases the digest lock', async () => {
  await triggers.notifyNewEvent.run(event('smtp-failure'));
  mailer.createMailer = () => ({ send: async () => { throw new Error('SMTP unavailable'); } });
  expect(await triggers.runDailyDigest()).toMatchObject({ sent: 0, failed: 1 });
  expect(await queued()).toHaveLength(1);
  mailer.createMailer = () => ({ send: async () => {} });
  expect(await triggers.runDailyDigest()).toMatchObject({ sent: 1, failed: 0 });
  expect(await queued()).toHaveLength(0);
});

test('an unexpected digest failure releases its lock and an expired worker can be recovered', async () => {
  await triggers.notifyNewEvent.run(event('digest-recovery'));
  mailer.loadEmailConfig = async () => { throw new Error('config unavailable'); };
  await expect(triggers.runDailyDigest()).rejects.toThrow('config unavailable');
  const ref = backend.db.doc('notificationConfig/digestRun');
  expect((await ref.get()).data()?.state).toBe('pending');
  await ref.set({ state: 'processing', owner: 'crashed-worker', leaseUntil: Timestamp.fromMillis(0) });
  mailer.loadEmailConfig = originalConfig;
  expect((await triggers.runDailyDigest()).sent).toBe(1);
  expect((await ref.get()).data()?.owner).toBeUndefined();
});

test('digest still honors member opt-out and the administrator off switch', async () => {
  await triggers.notifyNewEvent.run(event('opt-out'));
  await backend.db.doc('notificationConfig/email').update({ digestEnabled: false });
  expect((await triggers.runDailyDigest()).sent).toBe(0);
  expect(await queued()).toHaveLength(1);
  await backend.db.doc('notificationConfig/email').update({ digestEnabled: true });
  await backend.db.doc(`notificationSettings/${uid}`).set({ events: { digest: false, push: false } });
  expect((await triggers.runDailyDigest()).sent).toBe(0);
  expect(await queued()).toHaveLength(0);
});

test('legacy completed dispatch markers remain deduplicated', async () => {
  await backend.db.doc('notificationDispatches/event_legacy').set({ createdAt: Timestamp.now(), expireAt: Timestamp.now() });
  await triggers.notifyNewEvent.run(event('legacy'));
  expect(await queued()).toHaveLength(0);
});
