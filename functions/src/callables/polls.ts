import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { callableOptions } from '../lib/options';
import { clientIp, isMfaAdmin, requireAdmin, requireAppCheck, requireAuth, requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { recordAdminAction } from '../lib/adminAudit';
import { ballotPoints } from '../lib/pollBallot';
import {
  LIMITS,
  POLL_STATUSES,
  audienceAllowsVoter,
  canSeeResults,
  enforceLimit,
  isValidEventId,
  pollAudienceOrDefault,
  pollResultAudienceOrDefault,
  pollResultVisibilityOrDefault,
  pollStatusOrDraft,
  pollVotingModeOrDefault,
  pollVoteOptionIds,
  pollVoteDocId,
  pollWindowState,
  sanitizeText,
  validatePoll,
  validatePollBallot,
} from '../shared';

const POLLS = 'polls';
const VOTES = 'pollVotes';
const PARTICIPANT_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const pollVoteSalt = defineSecret('POLL_VOTE_SALT');
const pollCallableOptions = { ...callableOptions, serviceAccount: runtimeIdentity.polls, secrets: [pollVoteSalt] };

function pollVoteSaltValue(): string {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return process.env.POLL_VOTE_SALT || 'watershedcrew-emulator-poll-salt';
  }

  const value = pollVoteSalt.value().trim();
  if (value.length < 32) {
    throw new HttpsError('failed-precondition', 'Poll voting is temporarily unavailable.');
  }
  return value;
}

function requirePollId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new HttpsError('invalid-argument', 'Missing poll id.');
  }
  return value.trim();
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function toTimestamp(value: number | null): Timestamp | null {
  return value === null ? null : Timestamp.fromMillis(value);
}

// One vote per poll per person. Members are keyed by their Firebase uid;
// guests by a salted hash of the browser participant id so the raw value is
// never stored and cannot be replayed across polls.
function voterKeyFor(pollId: string, uid: string | null, participantId: unknown): { key: string; type: 'member' | 'guest' } {
  if (uid) return { key: `u:${uid}`, type: 'member' };
  if (typeof participantId !== 'string' || !PARTICIPANT_PATTERN.test(participantId)) {
    throw new HttpsError('invalid-argument', 'Missing guest participant id.');
  }
  const salt = pollVoteSaltValue();
  const hash = createHash('sha256').update(`${salt}:${pollId}:${participantId}`).digest('hex').slice(0, 32);
  return { key: `g:${hash}`, type: 'guest' };
}

type PollDoc = FirebaseFirestore.DocumentData;

function tallyMap(poll: PollDoc): Record<string, number> {
  const raw = (poll.tallies ?? {}) as Record<string, unknown>;
  return Object.fromEntries((poll.options ?? []).map((option: { id?: unknown }) => {
    const id = String((option as { id?: unknown }).id || '');
    return [id, Object.prototype.hasOwnProperty.call(raw, id) ? Number(raw[id] || 0) : 0];
  }));
}

function shapePoll(
  id: string,
  poll: PollDoc,
  viewer: { uid: string | null; isAdmin: boolean },
  myVote: { optionIds: string[]; updatedAt: number | null } | null,
  now = Date.now(),
) {
  const state = pollWindowState(
    { status: poll.status, opensAt: millis(poll.opensAt), closesAt: millis(poll.closesAt) },
    now,
  );
  const showResults = canSeeResults(
    {
      resultVisibility: poll.resultVisibility,
      resultAudience: poll.resultAudience,
      status: poll.status,
      opensAt: millis(poll.opensAt),
      closesAt: millis(poll.closesAt),
    },
    { isAdmin: viewer.isAdmin, signedIn: !!viewer.uid, hasVoted: !!myVote },
    now,
  );

  const tallies = tallyMap(poll);
  const totalVotes = Number(poll.totalVotes || 0);

  return {
    id,
    question: String(poll.question || ''),
    description: String(poll.description || ''),
    // Organizer notes are never included in member/visitor payloads.
    notes: viewer.isAdmin ? String(poll.notes || '') : '',
    options: (poll.options ?? []).map((option: PollDoc, index: number) => ({
      id: String(option.id || ''),
      label: String(option.label || ''),
      order: Number(option.order ?? index),
    })),
    status: pollStatusOrDraft(poll.status),
    state,
    votingMode: pollVotingModeOrDefault(poll.votingMode),
    maxRankedChoices: poll.votingMode === 'ranked' ? Number(poll.maxRankedChoices) : null,
    audience: pollAudienceOrDefault(poll.audience),
    resultVisibility: pollResultVisibilityOrDefault(poll.resultVisibility),
    resultAudience: pollResultAudienceOrDefault(poll.resultAudience),
    allowVoteChange: poll.allowVoteChange === true,
    showParticipation: poll.showParticipation !== false,
    privateVotes: poll.privateVotes !== false,
    opensAt: millis(poll.opensAt),
    closesAt: millis(poll.closesAt),
    eventId: String(poll.eventId || ''),
    createdAt: millis(poll.createdAt),
    updatedAt: millis(poll.updatedAt),
    myVote: myVote?.optionIds[0] ?? null,
    myVotes: myVote?.optionIds ?? [],
    myVoteAt: myVote ? myVote.updatedAt : null,
    hasVoted: !!myVote,
    canSeeResults: showResults,
    // Totals only ever leave the server when the visibility rules allow it.
    // Participation counts are separate: they are public when the poll opts in.
    results: showResults ? tallies : null,
    totalVotes: showResults || poll.showParticipation !== false || viewer.isAdmin ? totalVotes : null,
    participantCount: poll.showParticipation !== false || viewer.isAdmin ? totalVotes : null,
  };
}

async function loadMyVote(pollId: string, voterKey: string | null) {
  if (!voterKey) return null;
  const snap = await db.collection(VOTES).doc(pollVoteDocId(pollId, voterKey)).get();
  if (!snap.exists) return null;
  return {
    optionIds: pollVoteOptionIds(snap.data()),
    updatedAt: millis(snap.data()?.updatedAt) ?? millis(snap.data()?.createdAt),
  };
}

function optionalVoterKey(pollId: string, uid: string | null, participantId: unknown) {
  try {
    return voterKeyFor(pollId, uid, participantId).key;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ admin */

export const savePoll = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `pollSave:${uid}`, max: 120, windowSeconds: 3600 });

  const validation = validatePoll(request.data ?? {});
  if (!validation.ok) throw new HttpsError('invalid-argument', validation.reason);
  const poll = validation.poll;

  if (poll.eventId && !isValidEventId(poll.eventId)) {
    throw new HttpsError('invalid-argument', 'Invalid linked event.');
  }
  if (poll.eventId) {
    const eventSnap = await db.collection('events').doc(poll.eventId).get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Linked event not found.');
  }

  const pollId = typeof request.data?.id === 'string' && request.data.id ? request.data.id.trim() : '';
  const payload = {
    question: poll.question,
    description: poll.description,
    notes: poll.notes,
    options: poll.options,
    votingMode: poll.votingMode,
    maxRankedChoices: poll.maxRankedChoices,
    audience: poll.audience,
    resultVisibility: poll.resultVisibility,
    resultAudience: poll.resultAudience,
    allowVoteChange: poll.allowVoteChange,
    showParticipation: poll.showParticipation,
    privateVotes: poll.privateVotes,
    opensAt: toTimestamp(poll.opensAt),
    closesAt: toTimestamp(poll.closesAt),
    eventId: poll.eventId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (!pollId) {
    const tallies = Object.fromEntries(poll.options.map(option => [option.id, 0]));
    const ref = await db.collection(POLLS).add({
      ...payload,
      status: pollStatusOrDraft(request.data?.status),
      tallies,
      totalVotes: 0,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });
    await recordAdminAction(request, {
      action: 'poll.create', summary: 'Created poll', resourceType: 'poll', resourceId: ref.id,
    });
    return { id: ref.id };
  }

  const ref = db.collection(POLLS).doc(pollId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Poll not found.');
    const existing = snap.data() ?? {};
    const existingOptions = (existing.options ?? []).map((option: PollDoc) => ({
      id: String(option.id || ''),
      label: String(option.label || ''),
    }));
    const nextOptions = poll.options.map(option => ({ id: option.id, label: option.label }));
    const optionsChanged = existingOptions.length !== nextOptions.length
      || existingOptions.some((option: { id: string; label: string }, index: number) => (
        option.id !== nextOptions[index]?.id || option.label !== nextOptions[index]?.label
      ));

    const votingChanged = pollVotingModeOrDefault(existing.votingMode) !== poll.votingMode
      || (existing.maxRankedChoices ?? null) !== poll.maxRankedChoices;
    if ((optionsChanged || votingChanged) && Number(existing.totalVotes || 0) > 0) {
      throw new HttpsError(
        'failed-precondition',
        'This poll already has votes. Create a new poll to change the answer options, voting method, or ranking limit.',
      );
    }

    const previous = tallyMap(existing);
    const tallies = Object.fromEntries(poll.options.map(option => [option.id, Object.prototype.hasOwnProperty.call(previous, option.id) ? previous[option.id] : 0]));

    tx.update(ref, { ...payload, tallies });
  });
  await recordAdminAction(request, {
    action: 'poll.update', summary: 'Updated poll', resourceType: 'poll', resourceId: pollId,
  });
  return { id: pollId };
});

export const setPollStatus = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  const pollId = requirePollId(request.data?.pollId ?? request.data?.id);
  const status = String(request.data?.status || '');
  if (!(POLL_STATUSES as readonly string[]).includes(status)) {
    throw new HttpsError('invalid-argument', 'Unknown poll status.');
  }

  const ref = db.collection(POLLS).doc(pollId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Poll not found.');
  if (status === 'published' && (snap.data()?.options ?? []).length < 2) {
    throw new HttpsError('failed-precondition', 'Add at least two options before publishing.');
  }

  const stamps: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
  if (status === 'published') stamps.publishedAt = FieldValue.serverTimestamp();
  if (status === 'closed') stamps.closedAt = FieldValue.serverTimestamp();
  if (status === 'archived') stamps.archivedAt = FieldValue.serverTimestamp();

  await ref.update(stamps);
  await recordAdminAction(request, {
    action: `poll.${status}`, summary: `Set poll status to ${status}`, resourceType: 'poll', resourceId: pollId,
  });
  return { ok: true, status };
});

export const deletePoll = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `pollDelete:${uid}`, max: 30, windowSeconds: 3600 });
  const pollId = requirePollId(request.data?.pollId ?? request.data?.id);
  let removedVotes = 0;

  // Firestore batches are capped at 500 writes. Delete in bounded pages so a
  // popular poll can always be removed without crossing that limit.
  while (true) {
    const votes = await db.collection(VOTES).where('pollId', '==', pollId).limit(400).get();
    if (votes.empty) break;
    const batch = db.batch();
    votes.forEach(vote => batch.delete(vote.ref));
    await batch.commit();
    removedVotes += votes.size;
  }

  await db.collection(POLLS).doc(pollId).delete();
  await recordAdminAction(request, {
    action: 'poll.delete', summary: 'Deleted poll', resourceType: 'poll', resourceId: pollId,
    details: { removedVotes },
  });
  return { ok: true, removedVotes };
});

export const listAdminPolls = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const snap = await db.collection(POLLS).orderBy('createdAt', 'desc').limit(200).get();
  return {
    polls: snap.docs.map(doc => ({
      ...shapePoll(doc.id, doc.data(), { uid: request.auth?.uid ?? null, isAdmin: true }, null),
      tallies: tallyMap(doc.data()),
      totalVotes: Number(doc.data().totalVotes || 0),
    })),
  };
});

export const listPollVotes = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const pollId = requirePollId(request.data?.pollId);
  const snap = await db.collection(VOTES)
    .where('pollId', '==', pollId)
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();
  return {
    votes: snap.docs.map(doc => ({
      id: doc.id,
      pollId,
      userId: String(doc.data().userId || ''),
      optionId: String(doc.data().optionId || ''),
      optionIds: pollVoteOptionIds(doc.data()),
      voterType: String(doc.data().voterType || 'member'),
      createdAt: millis(doc.data().createdAt),
      updatedAt: millis(doc.data().updatedAt),
    })),
  };
});

/* ----------------------------------------------------------------- public */

export const listPolls = onCall(pollCallableOptions, async (request) => {
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  await enforceRateLimit({ key: `pollList:${uid || clientIp(request)}`, max: 600, windowSeconds: 3600 });

  const participantId = request.data?.participantId;
  const snap = await db.collection(POLLS)
    .where('status', 'in', ['published', 'closed'])
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const now = Date.now();
  const polls = await Promise.all(snap.docs.map(async (doc) => {
    const voterKey = optionalVoterKey(doc.id, uid, participantId);
    const myVote = await loadMyVote(doc.id, voterKey);
    return shapePoll(doc.id, doc.data(), { uid, isAdmin }, myVote, now);
  }));

  return { polls };
});

export const getPoll = onCall(pollCallableOptions, async (request) => {
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  const pollId = requirePollId(request.data?.pollId ?? request.data?.id);
  await enforceRateLimit({ key: `pollGet:${uid || clientIp(request)}`, max: 600, windowSeconds: 3600 });

  const snap = await db.collection(POLLS).doc(pollId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Poll not found.');
  const poll = snap.data() ?? {};
  const status = pollStatusOrDraft(poll.status);
  if (!isAdmin && status !== 'published' && status !== 'closed') {
    throw new HttpsError('not-found', 'Poll not found.');
  }

  const voterKey = optionalVoterKey(pollId, uid, request.data?.participantId);
  const myVote = await loadMyVote(pollId, voterKey);
  return { poll: shapePoll(pollId, poll, { uid, isAdmin }, myVote) };
});

// Totals never come from the client. This callable is the only read path for
// tallies, and it re-checks the visibility rules on every call.
export const getPollResults = onCall(pollCallableOptions, async (request) => {
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  const pollId = requirePollId(request.data?.pollId);
  await enforceRateLimit({ key: `pollResults:${uid || clientIp(request)}`, max: 600, windowSeconds: 3600 });

  const snap = await db.collection(POLLS).doc(pollId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Poll not found.');
  const poll = snap.data() ?? {};
  const status = pollStatusOrDraft(poll.status);
  if (!isAdmin && status !== 'published' && status !== 'closed') {
    throw new HttpsError('not-found', 'Poll not found.');
  }

  const voterKey = optionalVoterKey(pollId, uid, request.data?.participantId);
  const myVote = await loadMyVote(pollId, voterKey);
  const shaped = shapePoll(pollId, poll, { uid, isAdmin }, myVote);
  if (!shaped.canSeeResults) {
    throw new HttpsError('permission-denied', 'Results are not available yet.');
  }
  return {
    results: shaped.results,
    totalVotes: Number(poll.totalVotes || 0),
    myVote: shaped.myVote,
    myVotes: shaped.myVotes,
    votingMode: shaped.votingMode,
    maxRankedChoices: shaped.maxRankedChoices,
    state: shaped.state,
  };
});

// Public-response roster for polls whose organizer explicitly disables vote
// privacy. It returns only display-safe names and never exposes UIDs, voter
// keys, email addresses, or guest identifiers.
export const listPublicPollVotes = onCall(pollCallableOptions, async (request) => {
  requireAppCheck(request);
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  const pollId = requirePollId(request.data?.pollId);
  await enforceRateLimit({ key: `pollPublicVotes:${uid || clientIp(request)}`, max: 300, windowSeconds: 3600 });

  const pollSnap = await db.collection(POLLS).doc(pollId).get();
  if (!pollSnap.exists) throw new HttpsError('not-found', 'Poll not found.');
  const poll = pollSnap.data() ?? {};
  const status = pollStatusOrDraft(poll.status);
  if (!isAdmin && status !== 'published' && status !== 'closed') {
    throw new HttpsError('not-found', 'Poll not found.');
  }
  if (poll.privateVotes !== false) {
    throw new HttpsError('permission-denied', 'Individual responses are private for this poll.');
  }

  const voterKey = optionalVoterKey(pollId, uid, request.data?.participantId);
  const myVote = await loadMyVote(pollId, voterKey);
  const shaped = shapePoll(pollId, poll, { uid, isAdmin }, myVote);
  if (!shaped.canSeeResults) {
    throw new HttpsError('permission-denied', 'Responses are not available yet.');
  }

  const votes = await db.collection(VOTES)
    .where('pollId', '==', pollId)
    .where('privateVote', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const memberIds = [...new Set(votes.docs
    .filter(vote => vote.data().voterType === 'member')
    .map(vote => String(vote.data().userId || ''))
    .filter(Boolean))];
  const memberDocs = memberIds.length
    ? await db.getAll(...memberIds.map(memberId => db.collection('users').doc(memberId)))
    : [];
  const labels = new Map(memberDocs.map(member => {
    const data = member.data() ?? {};
    const userName = enforceLimit(sanitizeText(data.userName), LIMITS.userName);
    return [member.id, userName ? `@${userName}` : 'Member'];
  }));

  return {
    votes: votes.docs.map(vote => {
      const data = vote.data();
      const member = data.voterType === 'member';
      return {
        // Never return the vote document id: member vote ids contain the UID.
        id: createHash('sha256').update(`${pollId}:${vote.id}`).digest('hex').slice(0, 20),
        voterLabel: member ? (labels.get(String(data.userId || '')) || 'Member') : 'Guest neighbor',
        optionId: String(data.optionId || ''),
        optionIds: pollVoteOptionIds(data),
        createdAt: millis(data.createdAt),
        updatedAt: millis(data.updatedAt),
      };
    }),
    truncated: votes.size === 200,
  };
});

export const castPollVote = onCall(pollCallableOptions, async (request) => {
  requireAppCheck(request);
  const uid = request.auth?.uid ?? null;
  const isAdmin = isMfaAdmin(request);
  const pollId = requirePollId(request.data?.pollId);
  const submitted = request.data?.optionIds !== undefined
    ? request.data.optionIds
    : (typeof request.data?.optionId === 'string' ? [request.data.optionId.trim()] : []);

  const pollRef = db.collection(POLLS).doc(pollId);
  const pollSnap = await pollRef.get();
  if (!pollSnap.exists) throw new HttpsError('not-found', 'Poll not found.');
  const poll = pollSnap.data() ?? {};

  const audience = pollAudienceOrDefault(poll.audience);
  if (!audienceAllowsVoter(audience, !!uid)) {
    throw new HttpsError(
      'permission-denied',
      audience === 'members' ? 'Please sign in to vote in this poll.' : 'This poll is open to guests only.',
    );
  }
  if (audience === 'members' && !uid) requireAuth(request);
  if (uid) requireVerifiedEmail(request);

  const state = pollWindowState(
    { status: poll.status, opensAt: millis(poll.opensAt), closesAt: millis(poll.closesAt) },
  );
  if (state !== 'open') {
    const message = state === 'upcoming' ? 'This poll has not opened yet.' : 'This poll is closed.';
    throw new HttpsError('failed-precondition', message);
  }

  const initialBallot = validatePollBallot({ ...poll, options: poll.options ?? [] }, submitted);
  if (!initialBallot.ok) throw new HttpsError('invalid-argument', initialBallot.reason);

  const { key: voterKey, type: voterType } = voterKeyFor(pollId, uid, request.data?.participantId);
  await enforceRateLimit({ key: `pollVote:${voterKey}`, max: 30, windowSeconds: 3600 });
  await enforceRateLimit({ key: `pollVotePollIp:${pollId}:${clientIp(request)}`, max: 10, windowSeconds: 3600 });
  await enforceRateLimit({ key: `pollVoteIp:${clientIp(request)}`, max: 60, windowSeconds: 3600 });

  const voteRef = db.collection(VOTES).doc(pollVoteDocId(pollId, voterKey));

  await db.runTransaction(async (tx) => {
    const [freshPoll, voteSnap] = await Promise.all([tx.get(pollRef), tx.get(voteRef)]);
    if (!freshPoll.exists) throw new HttpsError('not-found', 'Poll not found.');
    const current = freshPoll.data() ?? {};
    const freshState = pollWindowState(
      { status: current.status, opensAt: millis(current.opensAt), closesAt: millis(current.closesAt) },
    );
    if (freshState !== 'open') throw new HttpsError('failed-precondition', 'This poll is not accepting votes.');
    if (!audienceAllowsVoter(pollAudienceOrDefault(current.audience), !!uid)) {
      throw new HttpsError('permission-denied', 'You are not eligible to vote in this poll.');
    }
    const ballot = validatePollBallot({ ...current, options: current.options ?? [] }, submitted);
    if (!ballot.ok) throw new HttpsError('invalid-argument', ballot.reason);
    const optionIds = ballot.optionIds;
    const previousIds = voteSnap.exists ? pollVoteOptionIds(voteSnap.data()) : [];
    if (voteSnap.exists) {
      if (current.allowVoteChange !== true) throw new HttpsError('already-exists', 'You already voted in this poll.');
      if (JSON.stringify(previousIds) === JSON.stringify(optionIds)) return;
    }

    const tallies = tallyMap(current);
    const previousPoints = ballotPoints(current, previousIds);
    const nextPoints = ballotPoints(current, optionIds);
    for (const id of Object.keys(tallies)) {
      tallies[id] += (Object.prototype.hasOwnProperty.call(nextPoints, id) ? nextPoints[id] : 0)
        - (Object.prototype.hasOwnProperty.call(previousPoints, id) ? previousPoints[id] : 0);
    }
    tx.update(pollRef, {
      tallies,
      totalVotes: Number(current.totalVotes || 0) + (voteSnap.exists ? 0 : 1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (voteSnap.exists) {
      tx.update(voteRef, {
        optionId: optionIds[0],
        optionIds,
        updatedAt: FieldValue.serverTimestamp(),
        changeCount: FieldValue.increment(1),
      });
      return;
    }

    tx.set(voteRef, {
      pollId,
      userId: uid || voterKey,
      voterKey,
      voterType,
      optionId: optionIds[0],
      optionIds,
      anonymousVoter: !uid,
      privateVote: current.privateVotes !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      changeCount: 0,
    });
  });

  const updated = await pollRef.get();
  const myVote = await loadMyVote(pollId, voterKey);
  return { ok: true, poll: shapePoll(pollId, updated.data() ?? {}, { uid, isAdmin }, myVote) };
});
