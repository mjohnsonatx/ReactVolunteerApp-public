// Shared poll contracts: option limits, audience/visibility enums, sanitizers,
// and the state machine helpers used by both the admin console and the public
// poll pages. Tallies are never computed here - they only ever come back from
// a callable Function.

import { LIMITS, detectMalicious, enforceLimit, sanitizeMultiline, sanitizeText } from './sanitize';

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 15;

export const POLL_VOTING_MODES = ['single', 'multiple', 'ranked'] as const;
export type PollVotingMode = (typeof POLL_VOTING_MODES)[number];
export const POLL_VOTING_MODE_LABELS: Readonly<Record<PollVotingMode, string>> = {
  single: 'Single choice',
  multiple: 'Select all that work',
  ranked: 'Rank up to K choices',
};

export const POLL_STATUSES = ['draft', 'published', 'closed', 'archived'] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

// Who is allowed to cast a vote.
export const POLL_AUDIENCES = ['members', 'guests', 'anyone'] as const;
export type PollAudience = (typeof POLL_AUDIENCES)[number];

// When the running totals may be revealed.
export const POLL_RESULT_VISIBILITIES = ['beforeVote', 'afterVote', 'afterClose', 'adminOnly'] as const;
export type PollResultVisibility = (typeof POLL_RESULT_VISIBILITIES)[number];

// Who may see the results once they are visible.
export const POLL_RESULT_AUDIENCES = ['public', 'members'] as const;
export type PollResultAudience = (typeof POLL_RESULT_AUDIENCES)[number];

export const POLL_AUDIENCE_LABELS: Readonly<Record<PollAudience, string>> = {
  members: 'Signed-in members only',
  guests: 'Guests only (no account)',
  anyone: 'Anyone (members and guests)',
};

export const POLL_RESULT_VISIBILITY_LABELS: Readonly<Record<PollResultVisibility, string>> = {
  beforeVote: 'Always visible (even before voting)',
  afterVote: 'After the person votes',
  afterClose: 'Only after the poll closes',
  adminOnly: 'Admins only',
};

export const POLL_RESULT_AUDIENCE_LABELS: Readonly<Record<PollResultAudience, string>> = {
  public: 'Everyone who can see the poll',
  members: 'Signed-in members only',
};

export type PollOptionInput = { id?: unknown; label?: unknown };
export type PollOption = { id: string; label: string; order: number };

export type PollInput = {
  question?: unknown;
  description?: unknown;
  notes?: unknown;
  options?: unknown;
  votingMode?: unknown;
  maxRankedChoices?: unknown;
  audience?: unknown;
  resultVisibility?: unknown;
  resultAudience?: unknown;
  allowVoteChange?: unknown;
  showParticipation?: unknown;
  privateVotes?: unknown;
  opensAt?: unknown;
  closesAt?: unknown;
  eventId?: unknown;
};

export type SanitizedPoll = {
  question: string;
  description: string;
  notes: string;
  options: PollOption[];
  votingMode: PollVotingMode;
  maxRankedChoices: number | null;
  audience: PollAudience;
  resultVisibility: PollResultVisibility;
  resultAudience: PollResultAudience;
  allowVoteChange: boolean;
  showParticipation: boolean;
  privateVotes: boolean;
  opensAt: number | null;
  closesAt: number | null;
  eventId: string;
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}

export function pollVotingModeOrDefault(value: unknown): PollVotingMode {
  return oneOf(value, POLL_VOTING_MODES, 'single');
}

// Legacy ballots store a single optionId; new ballots store optionIds in rank order.
export function pollVoteOptionIds(vote: { optionIds?: unknown; optionId?: unknown } | null | undefined): string[] {
  if (Array.isArray(vote?.optionIds)) return vote.optionIds.filter((id): id is string => typeof id === 'string');
  return typeof vote?.optionId === 'string' && vote.optionId ? [vote.optionId] : [];
}

export function validatePollBallot(
  poll: { options: Array<{ id: string }>; votingMode?: unknown; maxRankedChoices?: unknown },
  value: unknown,
): { ok: boolean; reason: string; optionIds: string[] } {
  const fail = (reason: string) => ({ ok: false, reason, optionIds: [] });
  if (!Array.isArray(value) || !value.length) return fail('Please choose at least one option.');
  if (value.length > POLL_MAX_OPTIONS || value.some(id => typeof id !== 'string')) return fail('Invalid ballot.');
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) return fail('Choose each option only once.');
  const allowed = new Set(poll.options.map(option => option.id));
  if (ids.some(id => !allowed.has(id))) return fail('That option does not belong to this poll.');
  const mode = pollVotingModeOrDefault(poll.votingMode);
  if (mode === 'single' && ids.length !== 1) return fail('Please choose exactly one option.');
  if (mode === 'ranked') {
    const k = poll.maxRankedChoices;
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > poll.options.length) return fail('This poll has an invalid ranking limit.');
    if (ids.length > k) return fail(`Rank at most ${k} choices.`);
  }
  // Unranked selection order has no meaning. Canonical order makes retries idempotent.
  return { ok: true, reason: '', optionIds: mode === 'multiple' ? poll.options.filter(option => ids.includes(option.id)).map(option => option.id) : [...ids] };
}

export function pollStatusOrDraft(value: unknown): PollStatus {
  return oneOf(value, POLL_STATUSES, 'draft');
}

export function pollAudienceOrDefault(value: unknown): PollAudience {
  return oneOf(value, POLL_AUDIENCES, 'members');
}

export function pollResultVisibilityOrDefault(value: unknown): PollResultVisibility {
  return oneOf(value, POLL_RESULT_VISIBILITIES, 'afterVote');
}

export function pollResultAudienceOrDefault(value: unknown): PollResultAudience {
  return oneOf(value, POLL_RESULT_AUDIENCES, 'public');
}

export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'object' && value !== null && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value.length === 16 ? `${value}:00` : value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Slug-ish deterministic option ids keep vote records readable and let the
// server prove that a submitted optionId really belongs to the poll.
export function normalizeOptionId(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const cleaned = raw.replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return cleaned || `opt${index + 1}`;
}

export function sanitizePollOptions(value: unknown): PollOption[] {
  // Keep (a bounded number of) extra entries so `validatePoll` can reject an
  // over-long list instead of silently truncating the admin's input.
  const list = Array.isArray(value) ? value.slice(0, POLL_MAX_OPTIONS * 4) : [];
  const seen = new Set<string>();
  const options: PollOption[] = [];
  list.forEach((entry, index) => {
    const source = (entry && typeof entry === 'object' ? entry : { label: entry }) as PollOptionInput;
    const label = enforceLimit(sanitizeText(source.label), LIMITS.pollOption);
    if (!label) return;
    let id = normalizeOptionId(source.id ?? label.toLowerCase().replace(/\s+/g, '-'), index);
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    options.push({ id, label, order: options.length });
  });
  return options;
}

export function sanitizePollInput(raw: PollInput | unknown): SanitizedPoll {
  const data = (raw && typeof raw === 'object' ? raw : {}) as PollInput;
  const options = sanitizePollOptions(data.options);
  const votingMode = pollVotingModeOrDefault(data.votingMode);
  const eventId = typeof data.eventId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.eventId.trim())
    ? data.eventId.trim()
    : '';
  return {
    question: enforceLimit(sanitizeText(data.question), LIMITS.pollQuestion),
    description: enforceLimit(sanitizeMultiline(data.description), LIMITS.pollDescription),
    notes: enforceLimit(sanitizeMultiline(data.notes), LIMITS.pollNotes),
    options,
    votingMode,
    maxRankedChoices: votingMode === 'ranked' ? Number(data.maxRankedChoices) : null,
    audience: pollAudienceOrDefault(data.audience),
    resultVisibility: pollResultVisibilityOrDefault(data.resultVisibility),
    resultAudience: pollResultAudienceOrDefault(data.resultAudience),
    allowVoteChange: data.allowVoteChange === true,
    showParticipation: data.showParticipation !== false,
    privateVotes: data.privateVotes !== false,
    opensAt: toMillis(data.opensAt),
    closesAt: toMillis(data.closesAt),
    eventId,
  };
}

export type PollValidation = { ok: boolean; reason: string; poll: SanitizedPoll };

export function validatePoll(raw: PollInput | unknown): PollValidation {
  const poll = sanitizePollInput(raw);
  const fail = (reason: string): PollValidation => ({ ok: false, reason, poll });

  // Inspect the raw values too: sanitizing first would quietly strip an
  // injected payload and let the poll through with mangled text.
  const source = (raw && typeof raw === 'object' ? raw : {}) as PollInput;
  if (source.votingMode !== undefined && !(POLL_VOTING_MODES as readonly unknown[]).includes(source.votingMode)) {
    return fail('Choose a valid voting method.');
  }
  if (poll.votingMode === 'ranked' && (
    typeof source.maxRankedChoices !== 'number' || !Number.isInteger(poll.maxRankedChoices)
    || Number(poll.maxRankedChoices) < 1 || Number(poll.maxRankedChoices) > poll.options.length
  )) return fail('The ranking limit must be a whole number from 1 to the number of options.');
  const hasValue = (value: unknown) => value !== null
    && value !== undefined
    && (typeof value !== 'string' || value.trim() !== '');
  const rawValues: unknown[] = [source.question, source.description, source.notes];
  if (Array.isArray(source.options)) {
    for (const option of source.options) {
      rawValues.push(option && typeof option === 'object' ? (option as PollOptionInput).label : option);
    }
  }
  for (const value of rawValues) {
    const check = detectMalicious(value);
    if (check.blocked) return fail(`Poll blocked: ${check.reason}`);
  }
  if (!poll.question) return fail('Please enter a poll question.');
  const questionCheck = detectMalicious(poll.question);
  if (questionCheck.blocked) return fail(`Question blocked: ${questionCheck.reason}`);
  const descriptionCheck = detectMalicious(poll.description);
  if (descriptionCheck.blocked) return fail(`Description blocked: ${descriptionCheck.reason}`);
  const notesCheck = detectMalicious(poll.notes);
  if (notesCheck.blocked) return fail(`Notes blocked: ${notesCheck.reason}`);
  if (poll.options.length < POLL_MIN_OPTIONS) {
    return fail(`Polls need at least ${POLL_MIN_OPTIONS} answer options.`);
  }
  if (poll.options.length > POLL_MAX_OPTIONS) {
    return fail(`Polls can have at most ${POLL_MAX_OPTIONS} answer options.`);
  }
  const normalizedLabels = poll.options.map(option => option.label.toLocaleLowerCase());
  if (new Set(normalizedLabels).size !== normalizedLabels.length) {
    return fail('Poll answer options must be unique.');
  }
  for (const option of poll.options) {
    const optionCheck = detectMalicious(option.label);
    if (optionCheck.blocked) return fail(`Option blocked: ${optionCheck.reason}`);
  }
  if (hasValue(source.opensAt) && poll.opensAt === null) {
    return fail('The opening date is invalid.');
  }
  if (hasValue(source.closesAt) && poll.closesAt === null) {
    return fail('The closing date is invalid.');
  }
  if (poll.opensAt !== null && poll.closesAt !== null && poll.closesAt <= poll.opensAt) {
    return fail('The closing date must come after the opening date.');
  }
  return { ok: true, reason: '', poll };
}

export type PollWindowState = 'draft' | 'upcoming' | 'open' | 'closed' | 'archived';

export function pollWindowState(
  poll: { status?: unknown; opensAt?: unknown; closesAt?: unknown },
  now: number = Date.now(),
): PollWindowState {
  const status = pollStatusOrDraft(poll.status);
  if (status === 'draft') return 'draft';
  if (status === 'archived') return 'archived';
  if (status === 'closed') return 'closed';
  const opensAt = toMillis(poll.opensAt);
  const closesAt = toMillis(poll.closesAt);
  if (opensAt !== null && now < opensAt) return 'upcoming';
  if (closesAt !== null && now >= closesAt) return 'closed';
  return 'open';
}

export function isPollOpen(poll: { status?: unknown; opensAt?: unknown; closesAt?: unknown }, now?: number): boolean {
  return pollWindowState(poll, now) === 'open';
}

export function audienceAllowsVoter(audience: PollAudience, signedIn: boolean): boolean {
  if (audience === 'anyone') return true;
  if (audience === 'members') return signedIn;
  return !signedIn;
}

// Deterministic vote document id => one vote per poll per person, enforced by
// Firestore's create/update semantics inside a transaction.
export function pollVoteDocId(pollId: string, voterKey: string): string {
  return `${pollId}__${voterKey}`.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 400);
}

export function canSeeResults(
  poll: { resultVisibility?: unknown; resultAudience?: unknown; status?: unknown; opensAt?: unknown; closesAt?: unknown },
  viewer: { isAdmin?: boolean; signedIn?: boolean; hasVoted?: boolean },
  now?: number,
): boolean {
  if (viewer.isAdmin) return true;
  const visibility = pollResultVisibilityOrDefault(poll.resultVisibility);
  if (visibility === 'adminOnly') return false;
  const audience = pollResultAudienceOrDefault(poll.resultAudience);
  if (audience === 'members' && !viewer.signedIn) return false;
  if (visibility === 'beforeVote') return true;
  if (visibility === 'afterVote') return viewer.hasVoted === true || pollWindowState(poll, now) === 'closed';
  return pollWindowState(poll, now) === 'closed';
}
