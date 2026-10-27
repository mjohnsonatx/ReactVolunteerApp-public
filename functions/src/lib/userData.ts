import type { Query } from 'firebase-admin/firestore';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db, adminAuth, adminStorage } from './firebaseAdmin';
import { forumAuthorKey } from '../shared';

const DELETED_AUTHOR = '[Deleted User]';
const DELETED_AUTHOR_ID = 'deleted';
const DELETED_USER_NAME = 'deleted-user';

export async function anonymizeForumPosts(uid: string): Promise<number> {
  const [snap, identities] = await Promise.all([
    db.collection('forumPosts').get(),
    db.collection('forumAuthors').where('authorId', '==', uid).get(),
  ]);
  const privateKeys = new Set(identities.docs.map(doc => doc.id));
  const updates: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

  snap.forEach((docSnap) => {
    const post = docSnap.data();
    const update: Record<string, unknown> = {};
    let changed = false;

    if (post.authorId === uid || privateKeys.has(forumAuthorKey(docSnap.id))) {
      update.author = DELETED_AUTHOR;
      update.authorId = DELETED_AUTHOR_ID;
      update.authorUserName = DELETED_USER_NAME;
      update.title = '[Removed]';
      update.content = '[Removed after account deletion]';
      changed = true;
    }
    if (Array.isArray(post.replies)) {
      let replyChanged = false;
      const replies = post.replies.map((r: any) => {
        if (r?.authorId !== uid && !privateKeys.has(forumAuthorKey(docSnap.id, r.id))) return r;
        replyChanged = true;
        return { ...r, author: DELETED_AUTHOR, authorId: DELETED_AUTHOR_ID, authorUserName: DELETED_USER_NAME, text: '[Removed after account deletion]' };
      });
      if (replyChanged) { update.replies = replies; changed = true; }
    }
    if (changed) updates.push({ ref: docSnap.ref, data: update });
  });

  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of updates.slice(i, i + 400)) batch.update(ref, data);
    await batch.commit();
  }
  // Only remove the mapping after public content is scrubbed; retries can
  // still locate anonymous content if any of the public updates fail.
  await deleteByQuery(db.collection('forumAuthors').where('authorId', '==', uid));
  // Remove the uid-to-handle link too, but preserve the counter so an old
  // anonymous handle is never assigned to a different account in this thread.
  while (true) {
    const threads = await db.collection('forumAnonymousThreads').where('authorIds', 'array-contains', uid).limit(400).get();
    if (threads.empty) break;
    const batch = db.batch();
    threads.forEach(thread => batch.update(thread.ref,
      new FieldPath('aliases', uid), FieldValue.delete(),
      'authorIds', FieldValue.arrayRemove(uid)));
    await batch.commit();
  }
  return updates.length;
}

export async function anonymizeForumReportsForTarget(uid: string): Promise<number> {
  let changed = 0;
  while (true) {
    const snap = await db.collection('forumReports').where('targetAuthorId', '==', uid).limit(400).get();
    if (snap.empty) return changed;
    const batch = db.batch();
    snap.forEach((d) => batch.update(d.ref, {
      targetAuthorName: DELETED_AUTHOR,
      targetAuthorId: DELETED_AUTHOR_ID,
      targetAuthorUserName: DELETED_USER_NAME,
      excerpt: '[Removed]',
      details: '[Removed after account deletion]',
      ...(d.data().targetType === 'post' ? { postTitle: '[Removed]' } : {}),
    }));
    await batch.commit();
    changed += snap.size;
  }
}

export async function anonymizePendingForumReplies(uid: string): Promise<number> {
  let changed = 0;
  while (true) {
    const snap = await db.collection('forumPendingReplies').where('authorId', '==', uid).limit(400).get();
    if (snap.empty) return changed;
    const batch = db.batch();
    snap.forEach((d) => batch.update(d.ref, {
      authorId: DELETED_AUTHOR_ID,
      'reply.author': DELETED_AUTHOR,
      'reply.authorId': DELETED_AUTHOR_ID,
      'reply.authorUserName': DELETED_USER_NAME,
      'reply.text': '[Removed after account deletion]',
    }));
    await batch.commit();
    changed += snap.size;
  }
}

export async function deleteForumReportsForReporter(uid: string): Promise<void> {
  await deleteByQuery(db.collection('forumReports').where('reporterId', '==', uid));
}

export async function deleteByQuery(q: Query): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await q.limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
}

export async function deleteUserDocuments(uid: string): Promise<void> {
  const [snap, tickets] = await Promise.all([
    db.collection('documents').where('userId', '==', uid).get(),
    db.collection('documentUploadTickets').where('userId', '==', uid).get(),
  ]);
  const bucket = adminStorage.bucket();
  const paths = new Set<string>();
  for (const doc of [...snap.docs, ...tickets.docs]) {
    const data = doc.data();
    if (typeof data.storagePath === 'string' && data.storagePath) paths.add(data.storagePath);
    if (typeof data.thumbnailPath === 'string' && data.thumbnailPath) paths.add(data.thumbnailPath);
  }
  for (const path of paths) {
    if (!path.startsWith(`documents/${uid}/`)) continue;
    try { await bucket.file(path).delete(); }
    catch (err: any) { if (err?.code !== 404) throw err; }
  }
  // Tickets and records do not cover interrupted uploads or old orphan files.
  const [files] = await bucket.getFiles({ prefix: `documents/${uid}/` });
  for (const file of files) await file.delete();
  for (const doc of snap.docs) await doc.ref.delete();
  for (const ticket of tickets.docs) await ticket.ref.delete();
  await db.collection('documentUploadQuotas').doc(uid).delete();
}

async function clearUserReference(collection: string, field: string, uid: string): Promise<void> {
  while (true) {
    const snap = await db.collection(collection).where(field, '==', uid).limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.forEach(doc => batch.update(doc.ref, { [field]: FieldValue.delete() }));
    await batch.commit();
  }
}

/** Shared, resumable cleanup for self-service and administrator deletion. */
export async function deleteAccountData(uid: string, fallbackEmail = ''): Promise<void> {
  const profileRef = db.collection('users').doc(uid);
  const profile = await profileRef.get();
  const email = String(profile.data()?.email || fallbackEmail).trim().toLowerCase();
  const userName = String(profile.data()?.userName || '').trim();
  if (profile.exists) {
    await profileRef.update({ accountStatus: 'deleting', moderated: true });
  }

  const failures: string[] = [];
  const attempt = async (label: string, work: () => Promise<unknown>) => {
    try { await work(); } catch { failures.push(label); }
  };

  await attempt('forum content', async () => {
    await anonymizeForumPosts(uid);
    await anonymizePendingForumReplies(uid);
    await anonymizeForumReportsForTarget(uid);
    await deleteForumReportsForReporter(uid);
  });
  await attempt('event comments', async () => {
    await deleteByQuery(db.collection('eventCommentReports').where('reporterId', '==', uid));
    await deleteByQuery(db.collection('eventCommentReports').where('targetAuthorId', '==', uid));
    await deleteByQuery(db.collection('eventComments').where('authorId', '==', uid));
  });
  await attempt('poll votes', () => deleteByQuery(db.collection('pollVotes').where('userId', '==', uid)));
  await attempt('RSVPs', () => deleteByQuery(db.collection('rsvps').where('userId', '==', uid)));
  await attempt('documents and Storage', () => deleteUserDocuments(uid));
  await attempt('support messages', () => deleteByQuery(db.collection('profileMessages').where('userId', '==', uid)));
  await attempt('error logs', () => deleteByQuery(db.collection('errorLogs').where('uid', '==', uid)));
  await attempt('notification settings', async () => {
    await deleteByQuery(db.collection('notificationTokens').where('uid', '==', uid));
    await deleteByQuery(db.collection('notificationDigestItems').where('uid', '==', uid));
    await db.collection('notificationSettings').doc(uid).delete();
  });
  await attempt('overlay uploads', async () => {
    await deleteByQuery(db.collection('overlayUploads').where('uploadedBy', '==', uid));
    if (email) await deleteByQuery(db.collection('overlayUploads').where('uploadedByEmail', '==', email));
  });
  await attempt('administrator references', async () => {
    for (const [collection, field] of [
      ['polls', 'createdBy'], ['polls', 'updatedBy'],
      ['eventComments', 'moderatedBy'], ['eventCommentReports', 'resolvedBy'],
      ['overlayUploads', 'reviewedBy'],
    ]) await clearUserReference(collection, field, uid);
    const siteContent = db.collection('siteContent').doc('main');
    const siteSnap = await siteContent.get();
    if (siteSnap.data()?.updatedBy === uid) await siteContent.update({ updatedBy: FieldValue.delete() });
  });
  await attempt('mailing list and volunteer signups', async () => {
    if (email) {
      await deleteByQuery(db.collection('mailingList').where('email', '==', email));
      await deleteByQuery(db.collection('volunteers').where('email', '==', email));
    }
  });
  await attempt('rate limits', async () => {
    const snap = await db.collection('rateLimits').get();
    for (const doc of snap.docs) {
      if (doc.id.endsWith(`:${uid}`) || doc.id.includes(`:${uid}:`)) await doc.ref.delete();
    }
  });
  await attempt('user name reservation', async () => {
    if (!userName) return;
    const ref = db.collection('userNames').doc(userName);
    const reservation = await ref.get();
    if (reservation.data()?.uid === uid) await ref.delete();
  });

  if (failures.length) throw new Error(`Some data could not be removed: ${failures.join(', ')}. Account deletion is paused; please retry or contact an administrator.`);

  try { await adminAuth.deleteUser(uid); }
  catch (err: any) { if (err?.code !== 'auth/user-not-found') throw err; }
  await profileRef.delete();
}
