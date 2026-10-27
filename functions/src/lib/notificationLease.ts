import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';

// Every caller has a platform-enforced 540-second timeout. The lease outlives
// that invocation, including a margin, before another worker can take over.
export const NOTIFICATION_TIMEOUT_SECONDS = 540;
export const NOTIFICATION_LEASE_MS = (NOTIFICATION_TIMEOUT_SECONDS + 60) * 1000;
export const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type NotificationLease = { ref: FirebaseFirestore.DocumentReference; owner: string };

export async function acquireNotificationLease(
  ref: FirebaseFirestore.DocumentReference,
  legacyIsComplete = false,
): Promise<NotificationLease | 'complete' | 'busy'> {
  const owner = randomUUID();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.state === 'complete' || (legacyIsComplete && snap.exists && !data?.state)) return 'complete';
    const now = Date.now();
    if (data?.state === 'processing' && data.leaseUntil?.toMillis() > now) return 'busy';
    tx.set(ref, {
      state: 'processing', owner,
      leaseUntil: Timestamp.fromMillis(now + NOTIFICATION_LEASE_MS),
      createdAt: data?.createdAt ?? FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(now + NOTIFICATION_RETENTION_MS),
    });
    return { ref, owner };
  });
}

/** Read before all other writes in a transaction; a replaced owner cannot commit. */
export async function assertNotificationLease(tx: FirebaseFirestore.Transaction, lease: NotificationLease): Promise<void> {
  const data = (await tx.get(lease.ref)).data();
  if (data?.state !== 'processing' || data.owner !== lease.owner || !(data.leaseUntil?.toMillis() > Date.now())) {
    throw new Error('Notification lease was lost or expired. Retry the operation.');
  }
}

export async function checkNotificationLease(lease: NotificationLease): Promise<void> {
  await db.runTransaction(tx => assertNotificationLease(tx, lease));
}

/** Only the owner can finish or release; an old worker cannot release a takeover. */
export async function finishNotificationLease(lease: NotificationLease, complete: boolean): Promise<void> {
  await db.runTransaction(async tx => {
    const data = (await tx.get(lease.ref)).data();
    if (data?.owner !== lease.owner || data.state !== 'processing') return;
    if (complete) await assertNotificationLease(tx, lease);
    tx.update(lease.ref, {
      state: complete ? 'complete' : 'pending',
      owner: FieldValue.delete(), leaseUntil: FieldValue.delete(),
    });
  });
}
