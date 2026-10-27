import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { randomId } from '../lib/ids';
import { requireActiveUserProfile } from '../lib/userProfile';
import { anonymousForumHandle } from '../lib/forumPrivacy';
import {
  sanitizePostForm, sanitizeMultiline, enforceLimit, detectMalicious, LIMITS, forumAuthorKey, publicForumIdentity,
} from '../shared';

const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or abuse',
  unsafe: 'Unsafe or illegal content',
  privacy: 'Private information',
  other: 'Other',
};

function cleanReportReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return REPORT_REASONS[reason] ? reason : 'other';
}

function reportContentKey(postId: string, replyId: string | null): string {
  return `${postId}_${replyId || 'post'}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 240);
}

function reportExcerpt(value: unknown): string {
  return enforceLimit(sanitizeMultiline(value), 240);
}

function anonymousChoice(value: unknown): boolean {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Anonymous must be true or false.');
  }
  return value === true;
}

export const submitForumPost = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `forumPost:${uid}`, max: 10, windowSeconds: 3600 });

  const { title, content } = request.data ?? {};
  const anonymous = anonymousChoice(request.data?.anonymous);
  for (const raw of [title, content]) {
    const r = detectMalicious(raw);
    if (r.blocked) throw new HttpsError('invalid-argument', `Post blocked: ${r.reason}`);
  }
  const clean = sanitizePostForm({ title, content });
  if (!clean.title) throw new HttpsError('invalid-argument', 'Please enter a valid title.');
  if (!clean.content) throw new HttpsError('invalid-argument', 'Please enter post content.');
  for (const v of [clean.title, clean.content]) {
    const r = detectMalicious(v);
    if (r.blocked) throw new HttpsError('invalid-argument', `Post blocked: ${r.reason}`);
  }

  const userData = await requireActiveUserProfile(uid);
  const moderated = userData.moderated === true;

  const ref = db.collection('forumPosts').doc();
  await db.runTransaction(async tx => {
    const label = anonymous ? await anonymousForumHandle(tx, ref.id, uid) : undefined;
    tx.set(ref, {
      ...publicForumIdentity(anonymous, uid, userData.userName || '', label),
      title: clean.title,
      content: clean.content,
      date: new Date().toLocaleDateString(),
      createdAt: FieldValue.serverTimestamp(),
      flagged: false,
      status: moderated ? 'pending' : 'approved',
      upvotes: 0,
      downvotes: 0,
      replies: [],
    });
    if (anonymous) tx.set(db.collection('forumAuthors').doc(forumAuthorKey(ref.id)), {
      postId: ref.id, replyId: '', authorId: uid, author: userData.userName || 'Member',
      authorUserName: userData.userName || '', createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: ref.id, status: moderated ? 'pending' : 'approved' };
});

export const submitReply = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `reply:${uid}`, max: 30, windowSeconds: 3600 });

  const postId = request.data?.postId;
  if (typeof postId !== 'string' || !postId) throw new HttpsError('invalid-argument', 'Missing post.');

  const anonymous = anonymousChoice(request.data?.anonymous);

  const cleanText = enforceLimit(sanitizeMultiline(request.data?.text), LIMITS.replyText);
  if (!cleanText) throw new HttpsError('invalid-argument', 'Reply cannot be empty.');
  const m = detectMalicious(cleanText);
  if (m.blocked) throw new HttpsError('invalid-argument', `Reply blocked: ${m.reason}`);

  const userData = await requireActiveUserProfile(uid);
  const moderated = userData.moderated === true;
  const reply = {
    id: randomId(20),
    ...publicForumIdentity(anonymous, uid, userData.userName || ''),
    text: cleanText,
    date: new Date().toLocaleDateString(),
    flagged: false,
    upvotes: 0,
    downvotes: 0,
  };

  const postRef = db.collection('forumPosts').doc(postId);
  const publishedReply = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Post not found.');
    if (snap.data()?.status !== 'approved') {
      throw new HttpsError('failed-precondition', 'Replies can only be added to approved posts.');
    }

    const label = anonymous ? await anonymousForumHandle(tx, postId, uid) : undefined;
    const publicReply = { ...reply, ...publicForumIdentity(anonymous, uid, userData.userName || '', label) };

    if (anonymous) tx.set(db.collection('forumAuthors').doc(forumAuthorKey(postId, reply.id)), {
      postId, replyId: reply.id, authorId: uid, author: userData.userName || 'Member',
      authorUserName: userData.userName || '', createdAt: FieldValue.serverTimestamp(),
    });

    if (moderated) {
      const pendingRef = db.collection('forumPendingReplies').doc(reply.id);
      tx.set(pendingRef, {
        postId,
        postTitle: String(snap.data()?.title || '').slice(0, LIMITS.postTitle),
        reply: publicReply,
        authorId: uid,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
      return publicReply;
    }

    const replies = snap.data()?.replies ?? [];
    if (replies.length >= 500) throw new HttpsError('resource-exhausted', 'This thread has reached its reply limit.');
    tx.update(postRef, { replies: [...replies, publicReply] });
    return publicReply;
  });
  return { reply: { ...publishedReply, status: moderated ? 'pending' : 'approved' }, status: moderated ? 'pending' : 'approved' };
});

export const castVote = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `vote:${uid}`, max: 120, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);

  const { postId, replyId, type } = request.data ?? {};
  if (typeof postId !== 'string' || !postId) throw new HttpsError('invalid-argument', 'Missing post.');
  if (type !== 'up' && type !== 'down') throw new HttpsError('invalid-argument', 'Invalid vote type.');
  const rid = typeof replyId === 'string' && replyId ? replyId : null;

  const postRef = db.collection('forumPosts').doc(postId);
  const userRef = db.collection('users').doc(uid);
  const key = `${postId}_${rid || 'post'}_${type}`;
  const oppositeKey = `${postId}_${rid || 'post'}_${type === 'up' ? 'down' : 'up'}`;

  const votes = await db.runTransaction(async (tx) => {
    const [postSnap, userSnap] = await Promise.all([tx.get(postRef), tx.get(userRef)]);
    if (!postSnap.exists) throw new HttpsError('not-found', 'Post not found.');

    const voteMap: Record<string, boolean> = { ...(userSnap.data()?.votes ?? {}) };
    const hasVoted = !!voteMap[key];
    const hasOpposite = !!voteMap[oppositeKey];

    const applyDelta = (up: number, down: number) => {
      if (hasVoted) { type === 'up' ? up-- : down--; }
      else {
        type === 'up' ? up++ : down++;
        if (hasOpposite) { type === 'up' ? down-- : up--; }
      }
      return { up: Math.max(0, up), down: Math.max(0, down) };
    };

    if (rid) {
      const replies = postSnap.data()?.replies ?? [];
      tx.update(postRef, {
        replies: replies.map((r: any) => {
          if (r.id !== rid) return r;
          const { up, down } = applyDelta(r.upvotes || 0, r.downvotes || 0);
          return { ...r, upvotes: up, downvotes: down };
        }),
      });
    } else {
      const { up, down } = applyDelta(postSnap.data()?.upvotes || 0, postSnap.data()?.downvotes || 0);
      tx.update(postRef, { upvotes: up, downvotes: down });
    }

    if (hasVoted) delete voteMap[key];
    else { voteMap[key] = true; if (hasOpposite) delete voteMap[oppositeKey]; }
    tx.set(userRef, { votes: voteMap }, { merge: true });
    return voteMap;
  });

  return { votes };
});

export const flagContent = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `flag:${uid}`, max: 30, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);

  const postId = request.data?.postId;
  if (typeof postId !== 'string' || !postId) throw new HttpsError('invalid-argument', 'Missing post.');
  const rid = typeof request.data?.replyId === 'string' && request.data.replyId ? request.data.replyId : null;
  const reason = cleanReportReason(request.data?.reason);
  const details = enforceLimit(sanitizeMultiline(request.data?.details), LIMITS.comment);
  if (!details) throw new HttpsError('invalid-argument', 'Please describe why you are reporting this.');
  const detailCheck = detectMalicious(details);
  if (detailCheck.blocked) throw new HttpsError('invalid-argument', `Report blocked: ${detailCheck.reason}`);

  const postRef = db.collection('forumPosts').doc(postId);
  const userRef = db.collection('users').doc(uid);
  const contentKey = reportContentKey(postId, rid);
  const reportRef = db.collection('forumReports').doc(`${contentKey}_${uid}`);
  const reportedContent = await db.runTransaction(async (tx) => {
    const [snap, userSnap, reportSnap, privateAuthorSnap] = await Promise.all([
      tx.get(postRef),
      tx.get(userRef),
      tx.get(reportRef),
      tx.get(db.collection('forumAuthors').doc(forumAuthorKey(postId, rid || ''))),
    ]);
    if (!snap.exists) throw new HttpsError('not-found', 'Post not found.');
    if (reportSnap.exists) throw new HttpsError('already-exists', 'You already reported this content.');

    const post = snap.data() ?? {};
    const reports: Record<string, boolean> = { ...(userSnap.data()?.reportedContent ?? {}) };
    if (reports[contentKey]) throw new HttpsError('already-exists', 'You already reported this content.');

    const reporter = userSnap.data() ?? {};
    let targetAuthorId = post.authorId || '';
    let targetAuthorName = post.author || '';
    let targetAuthorUserName = post.authorUserName || '';
    let excerpt = reportExcerpt(post.content || post.title || '');

    if (rid) {
      const replies = Array.isArray(post.replies) ? post.replies : [];
      const targetReply = replies.find((r: any) => r?.id === rid);
      if (!targetReply) throw new HttpsError('not-found', 'Reply not found.');
      const identity = targetReply.anonymous === true ? privateAuthorSnap.data() : targetReply;
      if (identity?.authorId === uid) throw new HttpsError('failed-precondition', 'You cannot report your own reply.');
      targetAuthorId = identity?.authorId || '';
      targetAuthorName = identity?.author || '';
      targetAuthorUserName = identity?.authorUserName || '';
      excerpt = reportExcerpt(targetReply.text || '');
      tx.update(postRef, { replies: replies.map((r: any) => (r.id === rid ? { ...r, flagged: true } : r)) });
    } else {
      const identity = post.anonymous === true ? privateAuthorSnap.data() : post;
      if (identity?.authorId === uid) throw new HttpsError('failed-precondition', 'You cannot report your own post.');
      targetAuthorId = identity?.authorId || '';
      targetAuthorName = identity?.author || '';
      targetAuthorUserName = identity?.authorUserName || '';
      tx.update(postRef, { flagged: true });
    }

    reports[contentKey] = true;
    tx.set(reportRef, {
      contentKey,
      postId,
      replyId: rid || '',
      targetType: rid ? 'reply' : 'post',
      postTitle: post.title || '',
      excerpt,
      targetAuthorId,
      targetAuthorName,
      targetAuthorUserName,
      reporterId: uid,
      reporterName: reporter.name || '',
      reporterUserName: reporter.userName || '',
      reporterEmail: reporter.email || '',
      reason,
      reasonLabel: REPORT_REASONS[reason],
      details,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(userRef, { reportedContent: reports }, { merge: true });
    return reports;
  });
  return { ok: true, reportedContent };
});
