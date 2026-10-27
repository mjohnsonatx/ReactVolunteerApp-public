import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';

interface RateLimitOptions {
  key: string;           // e.g. `forumPost:${uid}` or `volunteerSignup:${ip}`
  max: number;           // max events per window
  windowSeconds: number;
}

export async function enforceRateLimit({ key, max, windowSeconds }: RateLimitOptions): Promise<void> {
  const ref = db.collection('rateLimits').doc(key.replace(/\//g, '_'));
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : null;
    const windowStart: number = data?.windowStart ?? 0;
    const count: number = data?.count ?? 0;

    if (now - windowStart < windowSeconds * 1000) {
      if (count >= max) {
        throw new HttpsError('resource-exhausted', 'Too many requests. Please slow down and try again shortly.');
      }
      tx.update(ref, { count: FieldValue.increment(1) });
    } else {
      tx.set(ref, {
        windowStart: now,
        count: 1,
        expireAt: new Date(now + windowSeconds * 2 * 1000), // for Firestore TTL cleanup
      });
    }
  });
}