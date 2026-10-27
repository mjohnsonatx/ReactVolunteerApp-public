import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';

/** Call after other transaction reads and before writes. The private map makes
 * handles stable within one thread, never derived from a publicly known UID.
 * The counter is not decremented when an account is removed: no impersonation
 * by recycling the handle of a deleted participant. */
export async function anonymousForumHandle(tx: Transaction, postId: string, uid: string): Promise<string> {
  const ref = db.collection('forumAnonymousThreads').doc(postId);
  const snap = await tx.get(ref);
  const data = snap.data() || {};
  const aliases = data.aliases || {};
  if (Object.hasOwn(aliases, uid) && Number.isInteger(aliases[uid])) return `Anonymous ${aliases[uid]}`;
  const nextAlias = Number.isInteger(data.nextAlias) ? data.nextAlias : 1;
  if (nextAlias > 1000) throw new HttpsError('resource-exhausted', 'This thread has reached its anonymous participant limit.');
  tx.set(ref, {
    aliases: { ...aliases, [uid]: nextAlias },
    authorIds: [...(data.authorIds || []), uid],
    nextAlias: nextAlias + 1,
  });
  return `Anonymous ${nextAlias}`;
}
