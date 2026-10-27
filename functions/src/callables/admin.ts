import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { forumAuthorKey } from '../shared';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions, identityCallableOptions, mediaCallableOptions } from '../lib/options';
import { requireAdmin } from '../lib/guards';
import { db, adminStorage } from '../lib/firebaseAdmin';
import { recordAdminAction } from '../lib/adminAudit';
import {
  anonymizeForumPosts,
  anonymizeForumReportsForTarget,
  anonymizePendingForumReplies,
  deleteByQuery,
  deleteAccountData,
} from '../lib/userData';
import {
  detectMalicious,
  enforceLimit,
  LIMITS,
  sanitizeEmail,
  sanitizeEventForm,
  sanitizeGeoJSON,
  sanitizeMultiline,
  sanitizeSiteContentForm,
  sanitizeText,
  sanitizeUserName,
  sanitizeVolunteerForm,
} from '../shared';

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Missing ${label}.`);
  }
  return value.trim();
}

function cleanStoragePath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (!path || path.startsWith('/') || path.includes('..') || path.length > 500) return '';
  return path;
}

function cleanColor(value: unknown): string {
  const color = sanitizeText(value).slice(0, 32);
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#3366ff';
}

function assertCleanText(label: string, value: string): void {
  const check = detectMalicious(value);
  if (check.blocked) throw new HttpsError('invalid-argument', `${label} blocked: ${check.reason}`);
}

async function deleteStorageFile(path: unknown): Promise<void> {
  const cleanPath = cleanStoragePath(path);
  if (!cleanPath) return;
  await adminStorage.bucket().file(cleanPath).delete().catch(() => {});
}

async function unlinkEventPolls(eventId: string): Promise<number> {
  let changed = 0;
  while (true) {
    const snap = await db.collection('polls').where('eventId', '==', eventId).limit(400).get();
    if (snap.empty) return changed;
    const batch = db.batch();
    snap.forEach(poll => batch.update(poll.ref, {
      eventId: '',
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    changed += snap.size;
  }
}

export const deleteVolunteer = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'volunteer id');
  await db.collection('volunteers').doc(id).delete();
  await recordAdminAction(request, {
    action: 'volunteer.delete', summary: 'Deleted volunteer signup', resourceType: 'volunteer', resourceId: id,
  });
  return { ok: true };
});

export const updateVolunteer = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'volunteer id');
  const clean = sanitizeVolunteerForm(request.data ?? {});
  if (!clean.name || !clean.email) throw new HttpsError('invalid-argument', 'Please enter a valid name and email.');
  assertCleanText('Name', clean.name);
  await db.collection('volunteers').doc(id).update(clean);
  await recordAdminAction(request, {
    action: 'volunteer.update', summary: 'Updated volunteer signup', resourceType: 'volunteer', resourceId: id,
  });
  return clean;
});

export const removeMailingListEntry = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'mailing list id');
  await db.collection('mailingList').doc(id).delete();
  await recordAdminAction(request, {
    action: 'mailing-list.remove', summary: 'Removed mailing-list subscriber', resourceType: 'mailing-list', resourceId: id,
  });
  return { ok: true };
});

export const saveEvent = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const clean = sanitizeEventForm(request.data ?? {});
  if (!clean.title) throw new HttpsError('invalid-argument', 'Please enter a valid title.');
  if (!clean.location) throw new HttpsError('invalid-argument', 'Please enter a valid location.');
  assertCleanText('Title', clean.title);
  assertCleanText('Description', clean.description);

  const eventId = typeof request.data?.id === 'string' && request.data.id ? request.data.id : null;
  if (eventId) {
    await db.collection('events').doc(eventId).update(clean);
    await recordAdminAction(request, {
      action: 'event.update', summary: 'Updated event', resourceType: 'event', resourceId: eventId,
    });
    return { id: eventId };
  }
  const ref = await db.collection('events').add({ ...clean, createdAt: FieldValue.serverTimestamp() });
  await recordAdminAction(request, {
    action: 'event.create', summary: 'Created event', resourceType: 'event', resourceId: ref.id,
  });
  return { id: ref.id };
});

export const deleteEvent = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'event id');
  const eventRef = db.collection('events').doc(id);
  const event = await eventRef.get();
  if (!event.exists) throw new HttpsError('not-found', 'Event not found.');

  // Remove dependent records before the public event disappears. This keeps
  // navigation badges and admin queues from retaining orphaned work items.
  const [removedRsvps, removedComments, removedReports, unlinkedPolls] = await Promise.all([
    deleteByQuery(db.collection('rsvps').where('eventId', '==', id)),
    deleteByQuery(db.collection('eventComments').where('eventId', '==', id)),
    deleteByQuery(db.collection('eventCommentReports').where('eventId', '==', id)),
    unlinkEventPolls(id),
  ]);
  await eventRef.delete();
  await recordAdminAction(request, {
    action: 'event.delete',
    summary: 'Deleted event and related activity',
    resourceType: 'event',
    resourceId: id,
    details: { removedRsvps, removedComments, removedReports, unlinkedPolls },
  });
  return { ok: true, removedRsvps, removedComments, removedReports, unlinkedPolls };
});

export const approveForumPost = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'post id');
  await db.collection('forumPosts').doc(id).update({ status: 'approved', flagged: false });
  await recordAdminAction(request, {
    action: 'forum-post.approve', summary: 'Approved forum post', resourceType: 'forum-post', resourceId: id,
  });
  return { ok: true };
});

export const deleteForumPost = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'post id');
  await db.collection('forumPosts').doc(id).delete();
  const removedPendingReplies = await deleteByQuery(db.collection('forumPendingReplies').where('postId', '==', id));
  await deleteByQuery(db.collection('forumAuthors').where('postId', '==', id));
  await db.collection('forumAnonymousThreads').doc(id).delete();
  await recordAdminAction(request, {
    action: 'forum-post.delete', summary: 'Deleted forum post', resourceType: 'forum-post', resourceId: id,
    details: { removedPendingReplies },
  });
  return { ok: true };
});

export const approvePendingForumReply = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const replyId = requireId(request.data?.replyId, 'reply id');
  const pendingRef = db.collection('forumPendingReplies').doc(replyId);
  const outcome = await db.runTransaction(async (tx) => {
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) throw new HttpsError('not-found', 'Pending reply not found.');
    const pending = pendingSnap.data() ?? {};
    const postId = requireId(pending.postId, 'post id');
    const postRef = db.collection('forumPosts').doc(postId);
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) {
      tx.delete(pendingRef);
      tx.delete(db.collection('forumAuthors').doc(forumAuthorKey(postId, replyId)));
      return { postId, discarded: true };
    }
    const replies = Array.isArray(postSnap.data()?.replies) ? postSnap.data()?.replies : [];
    if (replies.length >= 500) throw new HttpsError('resource-exhausted', 'This thread has reached its reply limit.');
    const reply = pending.reply;
    if (!reply || typeof reply !== 'object' || reply.id !== replyId) {
      throw new HttpsError('failed-precondition', 'Pending reply data is invalid.');
    }
    tx.update(postRef, { replies: [...replies, { ...reply, status: 'approved' }] });
    tx.delete(pendingRef);
    return { postId, discarded: false };
  });
  await recordAdminAction(request, {
    action: outcome.discarded ? 'forum-reply.discard-orphan' : 'forum-reply.approve',
    summary: outcome.discarded ? 'Discarded reply whose forum post no longer exists' : 'Approved forum reply',
    resourceType: 'forum-reply',
    resourceId: replyId,
    details: { postId: outcome.postId },
  });
  return { ok: true };
});

export const deletePendingForumReply = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const replyId = requireId(request.data?.replyId, 'reply id');
  const pendingRef = db.collection('forumPendingReplies').doc(replyId);
  await db.runTransaction(async tx => {
    const pending = await tx.get(pendingRef);
    if (pending.exists) {
      tx.delete(db.collection('forumAuthors').doc(forumAuthorKey(pending.data()!.postId, replyId)));
      tx.delete(pendingRef);
    }
  });
  await recordAdminAction(request, {
    action: 'forum-reply.reject', summary: 'Rejected pending forum reply', resourceType: 'forum-reply', resourceId: replyId,
  });
  return { ok: true };
});

export const deleteForumReply = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const postId = requireId(request.data?.postId, 'post id');
  const replyId = requireId(request.data?.replyId, 'reply id');
  const ref = db.collection('forumPosts').doc(postId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Post not found.');
    const replies = Array.isArray(snap.data()?.replies) ? snap.data()?.replies : [];
    tx.update(ref, { replies: replies.filter((reply: any) => reply?.id !== replyId) });
    tx.delete(db.collection('forumAuthors').doc(forumAuthorKey(postId, replyId)));
  });
  await recordAdminAction(request, {
    action: 'forum-reply.delete', summary: 'Deleted forum reply', resourceType: 'forum-reply', resourceId: replyId,
    details: { postId },
  });
  return { ok: true };
});

export const unflagForumReply = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const postId = requireId(request.data?.postId, 'post id');
  const replyId = requireId(request.data?.replyId, 'reply id');
  const ref = db.collection('forumPosts').doc(postId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Post not found.');
    const replies = Array.isArray(snap.data()?.replies) ? snap.data()?.replies : [];
    tx.update(ref, { replies: replies.map((reply: any) => (reply?.id === replyId ? { ...reply, flagged: false } : reply)) });
  });
  await recordAdminAction(request, {
    action: 'forum-reply.unflag', summary: 'Cleared flag from forum reply', resourceType: 'forum-reply', resourceId: replyId,
    details: { postId },
  });
  return { ok: true };
});

export const importOverlay = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const cleanGeojson = sanitizeGeoJSON(JSON.parse(String(request.data?.geojson || '{}')));
  const name = enforceLimit(sanitizeText(request.data?.name), LIMITS.name);
  if (!name) throw new HttpsError('invalid-argument', 'Please enter a valid overlay name.');
  const description = enforceLimit(sanitizeMultiline(request.data?.description), LIMITS.comment);
  assertCleanText('Name', name);
  assertCleanText('Description', description);

  const ref = await db.collection('overlays').add({
    name,
    description,
    color: cleanColor(request.data?.color || cleanGeojson.features?.[0]?.properties?.stroke),
    geojson: JSON.stringify(cleanGeojson),
    featureCount: cleanGeojson.features.length,
    createdAt: FieldValue.serverTimestamp(),
    published: true,
  });
  await recordAdminAction(request, {
    action: 'overlay.import', summary: 'Imported map overlay', resourceType: 'overlay', resourceId: ref.id,
    details: { featureCount: cleanGeojson.features.length },
  });
  return { id: ref.id };
});

export const deleteOverlay = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'overlay id');
  await db.collection('overlays').doc(id).delete();
  await recordAdminAction(request, {
    action: 'overlay.delete', summary: 'Deleted map overlay', resourceType: 'overlay', resourceId: id,
  });
  return { ok: true };
});

export const toggleOverlayPublished = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'overlay id');
  const ref = db.collection('overlays').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Overlay not found.');
  const next = snap.data()?.published === false;
  await ref.update({ published: next });
  await recordAdminAction(request, {
    action: next ? 'overlay.publish' : 'overlay.unpublish',
    summary: next ? 'Published map overlay' : 'Unpublished map overlay',
    resourceType: 'overlay',
    resourceId: id,
  });
  return { published: next };
});

export const approveOverlayUpload = onCall(mediaCallableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const uploadId = requireId(request.data?.uploadId, 'overlay upload id');
  const uploadRef = db.collection('overlayUploads').doc(uploadId);
  const uploadSnap = await uploadRef.get();
  if (!uploadSnap.exists) throw new HttpsError('not-found', 'Overlay upload not found.');
  const upload = uploadSnap.data() ?? {};
  const cleanGeojson = sanitizeGeoJSON(JSON.parse(String(upload.geojson || '{}')));

  const overlayRef = db.collection('overlays').doc();
  const batch = db.batch();
  batch.set(overlayRef, {
    name: enforceLimit(sanitizeText(upload.name), LIMITS.name) || 'Overlay',
    description: enforceLimit(sanitizeMultiline(upload.description), LIMITS.comment),
    color: cleanColor(upload.color || cleanGeojson.features?.[0]?.properties?.stroke),
    geojson: JSON.stringify(cleanGeojson),
    featureCount: cleanGeojson.features.length,
    createdAt: FieldValue.serverTimestamp(),
    sourceUploadId: uploadId,
    published: true,
  });
  batch.update(uploadRef, {
    status: 'approved',
    deployedOverlayId: overlayRef.id,
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await recordAdminAction(request, {
    action: 'overlay-upload.approve', summary: 'Approved uploaded map overlay', resourceType: 'overlay-upload', resourceId: uploadId,
    details: { overlayId: overlayRef.id },
  });
  return { id: overlayRef.id };
});

export const rejectOverlayUpload = onCall(mediaCallableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const note = enforceLimit(sanitizeMultiline(request.data?.note), LIMITS.comment);
  const uploadId = requireId(request.data?.uploadId, 'overlay upload id');
  await db.collection('overlayUploads').doc(uploadId).update({
    status: 'rejected',
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
    ...(note ? { reviewNote: note } : {}),
  });
  await recordAdminAction(request, {
    action: 'overlay-upload.reject', summary: 'Rejected uploaded map overlay', resourceType: 'overlay-upload', resourceId: uploadId,
  });
  return { ok: true };
});

export const deleteOverlayUpload = onCall(mediaCallableOptions, async (request) => {
  requireAdmin(request);
  const uploadId = requireId(request.data?.uploadId, 'overlay upload id');
  await db.collection('overlayUploads').doc(uploadId).delete();
  await recordAdminAction(request, {
    action: 'overlay-upload.delete', summary: 'Deleted uploaded map overlay', resourceType: 'overlay-upload', resourceId: uploadId,
  });
  return { ok: true };
});

export const toggleUserModeration = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const uid = requireId(request.data?.uid, 'user id');
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found.');
  const moderated = typeof request.data?.moderated === 'boolean'
    ? request.data.moderated
    : snap.data()?.moderated !== true;
  await userRef.update({ moderated });
  await recordAdminAction(request, {
    action: moderated ? 'user.moderate' : 'user.unmoderate',
    summary: moderated ? 'Placed user in moderated mode' : 'Removed user from moderated mode',
    resourceType: 'user',
    resourceId: uid,
  });
  return { moderated };
});

export const saveAdminUserProfile = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const uid = typeof request.data?.uid === 'string' && request.data.uid ? request.data.uid : '';
  const volunteerId = typeof request.data?.volunteerId === 'string' && request.data.volunteerId ? request.data.volunteerId : '';
  if (uid && !volunteerId) {
    throw new HttpsError('failed-precondition', 'Registered user profile fields are self-service. Admins can moderate accounts or send password resets.');
  }

  const cleanName = enforceLimit(sanitizeText(request.data?.name), LIMITS.name);
  const cleanEmail = sanitizeEmail(request.data?.email);
  const cleanPhone = enforceLimit(sanitizeText(request.data?.phone || ''), LIMITS.phone);
  if (!cleanName) throw new HttpsError('invalid-argument', 'Please enter a valid name.');
  if (!cleanEmail) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  assertCleanText('Name', cleanName);

  const saved: Record<string, unknown> = {
    ...request.data,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
  };

  if (volunteerId) {
    await db.collection('volunteers').doc(volunteerId).update({ name: cleanName, email: cleanEmail, phone: cleanPhone });
    await recordAdminAction(request, {
      action: 'volunteer.update-profile', summary: 'Updated volunteer profile', resourceType: 'volunteer', resourceId: volunteerId,
    });
  }

  return saved;
});

export const adminAnonymizeForumPosts = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const uid = requireId(request.data?.uid, 'user id');
  const changedPosts = await anonymizeForumPosts(uid);
  const changedReports = await anonymizeForumReportsForTarget(uid);
  const changedPendingReplies = await anonymizePendingForumReplies(uid);
  await recordAdminAction(request, {
    action: 'user.anonymize-forum', summary: 'Anonymized user forum activity', resourceType: 'user', resourceId: uid,
    details: { changedPosts, changedReports, changedPendingReplies },
  });
  return { changed: changedPosts + changedReports + changedPendingReplies };
});

export const adminDeleteUserData = onCall({ ...identityCallableOptions, timeoutSeconds: 540 }, async (request) => {
  const { uid: adminUid } = requireAdmin(request);
  const uid = requireId(request.data?.uid, 'user id');
  if (uid === adminUid) throw new HttpsError('failed-precondition', 'You cannot delete your own admin account here.');
  try { await deleteAccountData(uid, sanitizeEmail(request.data?.email)); }
  catch (err: any) { throw new HttpsError('internal', err?.message || 'Account deletion failed.'); }
  await recordAdminAction(request, {
    action: 'user.delete-data', summary: 'Deleted user account data', resourceType: 'user', resourceId: uid,
  });
  return { ok: true };
});

// Sends an admin reply back to a member who used the "Message the Team" form.
// The reply is stored on the original profileMessages document, which the
// sender is allowed to read, closing the two-way contact loop.
export const replyToProfileMessage = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const id = requireId(request.data?.id, 'message id');
  const reply = enforceLimit(sanitizeMultiline(request.data?.reply), LIMITS.comment);
  if (!reply) throw new HttpsError('invalid-argument', 'Please enter a reply message.');
  assertCleanText('Reply', reply);

  const ref = db.collection('profileMessages').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Message not found.');

  const adminProfile = (await db.collection('users').doc(uid).get()).data() ?? {};
  const adminName = enforceLimit(sanitizeText(adminProfile.userName || 'Team'), LIMITS.userName) || 'Team';

  await ref.update({
    adminReply: reply,
    adminReplyBy: uid,
    adminReplyByName: adminName,
    adminReplyAt: FieldValue.serverTimestamp(),
    status: 'replied',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recordAdminAction(request, {
    action: 'profile-message.reply', summary: 'Replied to member message', resourceType: 'profile-message', resourceId: id,
  });
  return { ok: true, status: 'replied' };
});

export const saveSiteContent = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const clean = sanitizeSiteContentForm(request.data ?? {});
  for (const [label, value] of [
    ['Mission', clean.mission],
    ['Goals', clean.goals],
    ['Name', clean.about.name],
    ['Bio', clean.about.bio],
  ] as const) {
    assertCleanText(label, value);
  }

  const existing = await db.collection('siteContent').doc('main').get();
  const oldPath = cleanStoragePath(existing.data()?.about?.imagePath);
  const newPath = cleanStoragePath(clean.about.imagePath);
  if (newPath && !newPath.startsWith('siteContent/profile_')) {
    throw new HttpsError('invalid-argument', 'Invalid profile image path.');
  }

  await db.collection('siteContent').doc('main').set({
    ...clean,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });

  if (oldPath && oldPath !== newPath) await deleteStorageFile(oldPath);
  await recordAdminAction(request, {
    action: 'site-content.update', summary: 'Updated public site content', resourceType: 'site-content', resourceId: 'main',
  });
  return { ok: true };
});

export const recordAdminLogsExport = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  await recordAdminAction(request, {
    action: 'admin-log.export', summary: 'Requested complete administrator log export', resourceType: 'admin-log',
  });
  return { ok: true };
});
