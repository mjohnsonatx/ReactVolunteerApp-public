// Shared validation for the event discussion threads ("little forum" that
// hangs off each event card). The same helpers run in the browser (fast
// feedback) and inside the callable Functions (authoritative).

import { LIMITS, detectMalicious, enforceLimit, sanitizeMultiline, sanitizeText } from './sanitize';

export const EVENT_COMMENT_PAGE_SIZE = 10;
export const EVENT_COMMENT_MAX_PAGE_SIZE = 25;
export const ANONYMOUS_COMMENT_LABEL = 'Anonymous member';

export const EVENT_COMMENT_STATUSES = ['approved', 'pending', 'removed'] as const;
export type EventCommentStatus = (typeof EVENT_COMMENT_STATUSES)[number];

export const COMMENT_REPORT_REASONS: Readonly<Record<string, string>> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or abuse',
  unsafe: 'Unsafe or illegal content',
  privacy: 'Private information',
  other: 'Other',
};

export function cleanCommentReportReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return COMMENT_REPORT_REASONS[reason] ? reason : 'other';
}

export function sanitizeCommentBody(value: unknown): string {
  return enforceLimit(sanitizeMultiline(value), LIMITS.eventComment);
}

export type CommentValidation = { ok: boolean; reason: string; body: string };

export function validateCommentBody(raw: unknown): CommentValidation {
  const rawCheck = detectMalicious(raw);
  if (rawCheck.blocked) return { ok: false, reason: `Comment blocked: ${rawCheck.reason}`, body: '' };
  const body = sanitizeCommentBody(raw);
  if (!body) return { ok: false, reason: 'Please write a comment first.', body: '' };
  if (body.length < 2) return { ok: false, reason: 'Comments must be at least 2 characters.', body: '' };
  const check = detectMalicious(body);
  if (check.blocked) return { ok: false, reason: `Comment blocked: ${check.reason}`, body: '' };
  return { ok: true, reason: '', body };
}

// The label rendered to everyone else. Anonymous comments never expose the
// author's name to the public payload - admins get the real identity through
// a separate, admin-only field.
export function publicAuthorLabel(input: {
  anonymous?: unknown;
  anonymousLabel?: unknown;
  authorName?: unknown;
  authorUserName?: unknown;
}): string {
  if (input.anonymous === true) {
    return typeof input.anonymousLabel === 'string' && /^Anonymous [1-9][0-9]{0,3}$/.test(input.anonymousLabel)
      ? input.anonymousLabel : ANONYMOUS_COMMENT_LABEL;
  }
  const name = enforceLimit(sanitizeText(input.authorName), LIMITS.name);
  const userName = enforceLimit(sanitizeText(input.authorUserName), LIMITS.userName);
  // Prefer the single public identity; retain a fallback for legacy records
  // that predate usernames and for account-deletion labels.
  return userName ? `@${userName}` : name || 'Member';
}

export function clampCommentPageSize(value: unknown): number {
  const size = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : EVENT_COMMENT_PAGE_SIZE;
  return Math.min(Math.max(size, 1), EVENT_COMMENT_MAX_PAGE_SIZE);
}
