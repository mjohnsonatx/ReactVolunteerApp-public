import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { clientIp, isMfaAdmin, requireAdmin, requireAuth, requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { requireActiveUserProfile } from '../lib/userProfile';
import { recordAdminAction } from '../lib/adminAudit';
import {
  COMMENT_REPORT_REASONS,
  LIMITS,
  clampCommentPageSize,
  cleanCommentReportReason,
  detectMalicious,
  enforceLimit,
  isValidEventId,
  publicAuthorLabel,
  sanitizeMultiline,
  sanitizeText,
  validateCommentBody,
} from '../shared';

const COMMENTS = 'eventComments';
const REPORTS = 'eventCommentReports';

function requireEventId(value: unknown): string {
  if (!isValidEventId(value)) throw new HttpsError('invalid-argument', 'Missing or invalid event id.');
  return value;
}

function requireCommentId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new HttpsError('invalid-argument', 'Missing comment id.');
  }
  return value.trim();
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function eventCommentReportKey(commentId: string): string {
  return `eventComment_${commentId}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 240);
}

type ViewerContext = { uid: string | null; isAdmin: boolean; reported: Record<string, boolean> };

function shapeComment(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
  viewer: ViewerContext,
) {
  const data = doc.data() ?? {};
  const isOwn = !!viewer.uid && data.authorId === viewer.uid;
  const anonymous = data.anonymous === true;
  const base = {
    id: doc.id,
    eventId: String(data.eventId || ''),
    body: String(data.body || ''),
    authorLabel: anonymous
      ? publicAuthorLabel({ anonymous: true })
      : publicAuthorLabel({ authorName: data.authorName, authorUserName: data.authorUserName }),
    anonymous,
    isOwn,
    canEdit: isOwn,
    canDelete: isOwn || viewer.isAdmin,
    status: String(data.status || 'approved'),
    flagged: data.flagged === true,
    edited: data.edited === true,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    editedAt: millis(data.editedAt),
    reportedByMe: !!viewer.reported[eventCommentReportKey(doc.id)],
  };
  if (!viewer.isAdmin) return base;
  // Anonymity is a display choice, not a secret from the moderator.
  return {
    ...base,
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || ''),
    authorUserName: String(data.authorUserName || ''),
    reportCount: Number(data.reportCount || 0),
  };
}

async function loadViewer(request: { auth?: { uid: string; token: Record<string, unknown> } | undefined }): Promise<ViewerContext> {
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  if (!uid) return { uid: null, isAdmin: false, reported: {} };
  const userSnap = await db.collection('users').doc(uid).get();
  const reported = (userSnap.data()?.reportedContent ?? {}) as Record<string, boolean>;
  return { uid, isAdmin, reported };
}

// Batched read path. Comments are only ever served through this callable so
// anonymous authors stay anonymous no matter what a client asks Firestore for.
export const listEventComments = onCall(callableOptions, async (request) => {
  const eventId = requireEventId(request.data?.eventId);
  const viewer = await loadViewer(request);
  await enforceRateLimit({
    key: `eventCommentList:${viewer.uid || clientIp(request)}`,
    max: 600,
    windowSeconds: 3600,
  });

  const pageSize = clampCommentPageSize(request.data?.limit);
  const cursor = millis(request.data?.cursor);

  let query = db.collection(COMMENTS).where('eventId', '==', eventId);
  if (!viewer.isAdmin) query = query.where('status', '==', 'approved');
  query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);
  if (cursor !== null) query = query.startAfter(Timestamp.fromMillis(cursor));

  const snap = await query.get();
  const docs = snap.docs.slice(0, pageSize);
  const comments = docs.map(doc => shapeComment(doc, viewer));

  // A moderated member still sees their own pending comment on the first page.
  if (!viewer.isAdmin && viewer.uid && cursor === null) {
    const pending = await db.collection(COMMENTS)
      .where('eventId', '==', eventId)
      .where('authorId', '==', viewer.uid)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .get();
    for (const doc of pending.docs) {
      if (!comments.some(comment => comment.id === doc.id)) comments.unshift(shapeComment(doc, viewer));
    }
  }

  const last = docs[docs.length - 1];
  return {
    comments,
    nextCursor: snap.docs.length > pageSize && last ? millis(last.data().createdAt) : null,
    hasMore: snap.docs.length > pageSize,
    pageSize,
  };
});

export const submitEventComment = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `eventComment:${uid}`, max: 20, windowSeconds: 3600 });

  const eventId = requireEventId(request.data?.eventId);
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

  const validation = validateCommentBody(request.data?.body);
  if (!validation.ok) throw new HttpsError('invalid-argument', validation.reason);

  const userData = await requireActiveUserProfile(uid);
  const moderated = userData.moderated === true;
  const anonymous = request.data?.anonymous === true;

  const ref = await db.collection(COMMENTS).add({
    eventId,
    body: validation.body,
    authorId: uid,
    authorName: enforceLimit(sanitizeText(userData.userName || 'Member'), LIMITS.userName),
    authorUserName: enforceLimit(sanitizeText(userData.userName || ''), LIMITS.userName),
    anonymous,
    status: moderated ? 'pending' : 'approved',
    flagged: false,
    reportCount: 0,
    edited: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  const viewer: ViewerContext = { uid, isAdmin: isMfaAdmin(request), reported: {} };
  return { comment: shapeComment(snap, viewer), status: moderated ? 'pending' : 'approved' };
});

export const editEventComment = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `eventCommentEdit:${uid}`, max: 40, windowSeconds: 3600 });
  const userData = await requireActiveUserProfile(uid);

  const commentId = requireCommentId(request.data?.commentId);
  const validation = validateCommentBody(request.data?.body);
  if (!validation.ok) throw new HttpsError('invalid-argument', validation.reason);

  const ref = db.collection(COMMENTS).doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Comment not found.');
  if (snap.data()?.authorId !== uid) throw new HttpsError('permission-denied', 'You can only edit your own comment.');

  const anonymous = Object.prototype.hasOwnProperty.call(request.data ?? {}, 'anonymous')
    ? request.data.anonymous === true
    : snap.data()?.anonymous === true;

  await ref.update({
    body: validation.body,
    anonymous,
    status: userData.moderated === true ? 'pending' : snap.data()?.status || 'approved',
    edited: true,
    editedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const viewer = await loadViewer(request);
  return { comment: shapeComment(await ref.get(), viewer) };
});

export const deleteEventComment = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  await enforceRateLimit({ key: `eventCommentDelete:${uid}`, max: 60, windowSeconds: 3600 });

  const commentId = requireCommentId(request.data?.commentId);
  const ref = db.collection(COMMENTS).doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const isAdmin = isMfaAdmin(request);
  if (!isAdmin && snap.data()?.authorId !== uid) {
    throw new HttpsError('permission-denied', 'You can only delete your own comment.');
  }

  let removedReports = 0;
  // Keep every batch below Firestore's 500-write ceiling. A heavily reported
  // comment must remain deletable even if it has accumulated many reports.
  while (true) {
    const reports = await db.collection(REPORTS)
      .where('commentId', '==', commentId)
      .limit(400)
      .get();
    if (reports.empty) break;
    const batch = db.batch();
    reports.forEach(report => batch.delete(report.ref));
    await batch.commit();
    removedReports += reports.size;
  }

  await ref.delete();
  if (isAdmin) {
    await recordAdminAction(request, {
      action: 'event-comment.delete', summary: 'Deleted event comment', resourceType: 'event-comment', resourceId: commentId,
      details: { removedReports },
    });
  }
  return { ok: true, removedReports };
});

// Same flag -> dialog -> report record flow the forum already uses.
export const reportEventComment = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `eventCommentReport:${uid}`, max: 20, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);

  const commentId = requireCommentId(request.data?.commentId);
  const reason = cleanCommentReportReason(request.data?.reason);
  const details = enforceLimit(sanitizeMultiline(request.data?.details), LIMITS.reportDetails);
  if (!details) throw new HttpsError('invalid-argument', 'Please describe why you are reporting this.');
  const detailCheck = detectMalicious(details);
  if (detailCheck.blocked) throw new HttpsError('invalid-argument', `Report blocked: ${detailCheck.reason}`);

  const commentRef = db.collection(COMMENTS).doc(commentId);
  const userRef = db.collection('users').doc(uid);
  const reportRef = db.collection(REPORTS).doc(`${commentId}_${uid}`);
  const contentKey = eventCommentReportKey(commentId);

  const reportedContent = await db.runTransaction(async (tx) => {
    const [commentSnap, userSnap, reportSnap] = await Promise.all([
      tx.get(commentRef),
      tx.get(userRef),
      tx.get(reportRef),
    ]);
    if (!commentSnap.exists) throw new HttpsError('not-found', 'Comment not found.');
    if (reportSnap.exists) throw new HttpsError('already-exists', 'You already reported this comment.');

    const comment = commentSnap.data() ?? {};
    if (comment.authorId === uid) throw new HttpsError('failed-precondition', 'You cannot report your own comment.');

    const reports: Record<string, boolean> = { ...(userSnap.data()?.reportedContent ?? {}) };
    if (reports[contentKey]) throw new HttpsError('already-exists', 'You already reported this comment.');

    const reporter = userSnap.data() ?? {};
    tx.set(reportRef, {
      contentKey,
      commentId,
      eventId: String(comment.eventId || ''),
      excerpt: enforceLimit(sanitizeMultiline(comment.body || ''), 240),
      targetAuthorId: comment.authorId || '',
      targetAuthorName: comment.authorName || '',
      targetAuthorUserName: comment.authorUserName || '',
      targetWasAnonymous: comment.anonymous === true,
      reporterId: uid,
      reporterName: reporter.name || '',
      reporterUserName: reporter.userName || '',
      reporterEmail: reporter.email || '',
      reason,
      reasonLabel: COMMENT_REPORT_REASONS[reason],
      details,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(commentRef, { flagged: true, reportCount: FieldValue.increment(1) });
    reports[contentKey] = true;
    tx.set(userRef, { reportedContent: reports }, { merge: true });
    return reports;
  });

  return { ok: true, reportedContent };
});

// Admin moderation: approve a pending/flagged comment or hide it from members.
export const moderateEventComment = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const commentId = requireCommentId(request.data?.commentId);
  const action = String(request.data?.action || '');
  const ref = db.collection(COMMENTS).doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Comment not found.');

  if (action !== 'approve' && action !== 'remove') {
    throw new HttpsError('invalid-argument', 'Unknown moderation action.');
  }

  const status = action === 'approve' ? 'approved' : 'removed';
  await ref.update({
    status,
    flagged: false,
    updatedAt: FieldValue.serverTimestamp(),
    moderatedAt: FieldValue.serverTimestamp(),
    moderatedBy: uid,
  });

  // Close every report tied to the moderated comment. Use bounded batches so
  // report cleanup cannot exceed Firestore's 500-write transaction limit.
  let resolvedReports = 0;
  while (true) {
    const reports = await db.collection(REPORTS)
      .where('commentId', '==', commentId)
      .where('status', '==', 'new')
      .limit(400)
      .get();
    if (reports.empty) break;
    const batch = db.batch();
    reports.forEach(report => batch.update(report.ref, {
      status: 'resolved',
      resolution: action,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    resolvedReports += reports.size;
  }

  await recordAdminAction(request, {
    action: `event-comment.${action}`,
    summary: action === 'approve' ? 'Approved event comment' : 'Removed event comment',
    resourceType: 'event-comment',
    resourceId: commentId,
    details: { resolvedReports },
  });
  return { ok: true, status };
});
