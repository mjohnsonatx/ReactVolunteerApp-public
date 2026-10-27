import { describe, expect, it } from 'vitest';
import {
  buildEventImagePath,
  buildEventThumbnailPath,
  isAllowedEventImageSize,
  isAllowedEventImageType,
  isEventImagePath,
  sanitizeImageCaption,
  validateEventImageFile,
  EVENT_IMAGE_MAX_BYTES,
  validateCommentBody,
  publicAuthorLabel,
  ANONYMOUS_COMMENT_LABEL,
  clampCommentPageSize,
  validatePoll,
  pollWindowState,
  canSeeResults,
  audienceAllowsVoter,
  pollVoteDocId,
  POLL_MAX_OPTIONS,
} from '../../src/utils/sanitize';

describe('event image rules', () => {
  it('accepts only jpeg, png, and webp', () => {
    expect(isAllowedEventImageType('image/jpeg')).toBe(true);
    expect(isAllowedEventImageType('image/png')).toBe(true);
    expect(isAllowedEventImageType('image/webp')).toBe(true);
    expect(isAllowedEventImageType('image/gif')).toBe(false);
    expect(isAllowedEventImageType('application/pdf')).toBe(false);
    expect(isAllowedEventImageType('text/html')).toBe(false);
  });

  it('enforces the 5 MB cap', () => {
    expect(isAllowedEventImageSize(EVENT_IMAGE_MAX_BYTES)).toBe(true);
    expect(isAllowedEventImageSize(EVENT_IMAGE_MAX_BYTES + 1)).toBe(false);
    expect(isAllowedEventImageSize(0)).toBe(false);
    expect(validateEventImageFile({ type: 'image/png', size: 10 * 1024 * 1024 }).ok).toBe(false);
    expect(validateEventImageFile({ type: 'image/png', size: 1024 }).ok).toBe(true);
    expect(validateEventImageFile(null).ok).toBe(false);
  });

  it('builds scoped storage paths and rejects traversal', () => {
    expect(buildEventImagePath('event1', 'abcdef123456', 'image/jpeg')).toBe('events/event1/abcdef123456.jpg');
    expect(buildEventThumbnailPath('event1', 'abcdef123456')).toBe('events/event1/abcdef123456_thumb.jpg');
    expect(buildEventImagePath('../secrets', 'abcdef123456', 'image/jpeg')).toBe('');
    expect(buildEventImagePath('event1', 'BAD ID', 'image/jpeg')).toBe('');
    expect(isEventImagePath('events/event1/abcdef123456.jpg', 'event1')).toBe(true);
    expect(isEventImagePath('events/event2/abcdef123456.jpg', 'event1')).toBe(false);
    expect(isEventImagePath('documents/u1/secret.pdf')).toBe(false);
    expect(isEventImagePath('events/event1/../../etc/passwd')).toBe(false);
  });

  it('sanitizes captions', () => {
    expect(sanitizeImageCaption('<script>alert(1)</script>Creek clean-up')).not.toContain('<script>');
    expect(sanitizeImageCaption('x'.repeat(500)).length).toBe(200);
  });
});

describe('event comment rules', () => {
  it('rejects empty and malicious comments', () => {
    expect(validateCommentBody('').ok).toBe(false);
    expect(validateCommentBody('<script>alert(1)</script>').ok).toBe(false);
    expect(validateCommentBody('javascript:alert(1)').ok).toBe(false);
    const good = validateCommentBody('  Is parking available?  ');
    expect(good.ok).toBe(true);
    expect(good.body).toBe('Is parking available?');
  });

  it('hides the author name for anonymous comments', () => {
    expect(publicAuthorLabel({ anonymous: true, authorName: 'Jane' })).toBe(ANONYMOUS_COMMENT_LABEL);
    expect(publicAuthorLabel({ authorName: 'Jane' })).toBe('Jane');
    expect(publicAuthorLabel({ authorUserName: 'jane-d' })).toBe('@jane-d');
    expect(publicAuthorLabel({ authorName: 'Private Name', authorUserName: 'jane-d' })).toBe('@jane-d');
    expect(publicAuthorLabel({ anonymous: true, authorName: 'Private Name', authorUserName: 'jane-d' })).toBe(ANONYMOUS_COMMENT_LABEL);
  });

  it('clamps batch sizes', () => {
    expect(clampCommentPageSize(1000)).toBe(25);
    expect(clampCommentPageSize(0)).toBe(1);
    expect(clampCommentPageSize(undefined)).toBe(10);
  });
});

describe('poll rules', () => {
  const base = { question: 'Pick a workday', options: ['Saturday', 'Sunday'] };

  it('requires 2 to 15 options', () => {
    expect(validatePoll({ ...base, options: ['Only one'] }).ok).toBe(false);
    expect(validatePoll(base).ok).toBe(true);
    const many = Array.from({ length: POLL_MAX_OPTIONS }, (_, i) => `Option ${i + 1}`);
    expect(validatePoll({ ...base, options: many }).ok).toBe(true);
    expect(validatePoll({ ...base, options: [...many, 'One too many'] }).ok).toBe(false);
  });

  it('rejects malicious content and bad windows', () => {
    expect(validatePoll({ ...base, question: '<script>x</script>' }).ok).toBe(false);
    expect(validatePoll({ ...base, opensAt: 2000, closesAt: 1000 }).ok).toBe(false);
    expect(validatePoll({ ...base, opensAt: 'not-a-date' }).ok).toBe(false);
    expect(validatePoll({ ...base, closesAt: 'February 31st forever' }).ok).toBe(false);
  });

  it('rejects duplicate option labels', () => {
    const result = validatePoll({ ...base, options: ['Same', 'Same'] });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('unique');
  });

  it('computes the poll window state server-side style', () => {
    expect(pollWindowState({ status: 'draft' })).toBe('draft');
    expect(pollWindowState({ status: 'published', opensAt: 5000 }, 1000)).toBe('upcoming');
    expect(pollWindowState({ status: 'published', closesAt: 500 }, 1000)).toBe('closed');
    expect(pollWindowState({ status: 'published' }, 1000)).toBe('open');
    expect(pollWindowState({ status: 'archived' })).toBe('archived');
  });

  it('honors audience and result visibility toggles', () => {
    expect(audienceAllowsVoter('members', false)).toBe(false);
    expect(audienceAllowsVoter('guests', true)).toBe(false);
    expect(audienceAllowsVoter('anyone', false)).toBe(true);

    const poll = { resultVisibility: 'afterVote', resultAudience: 'public', status: 'published' };
    expect(canSeeResults(poll, { hasVoted: false })).toBe(false);
    expect(canSeeResults(poll, { hasVoted: true })).toBe(true);
    expect(canSeeResults({ ...poll, resultVisibility: 'adminOnly' }, { hasVoted: true })).toBe(false);
    expect(canSeeResults({ ...poll, resultVisibility: 'adminOnly' }, { isAdmin: true })).toBe(true);
    expect(canSeeResults({ ...poll, resultVisibility: 'beforeVote', resultAudience: 'members' }, { signedIn: false })).toBe(false);
    expect(canSeeResults({ ...poll, resultVisibility: 'afterClose', status: 'closed' }, {})).toBe(true);
  });

  it('creates one deterministic vote id per poll per person', () => {
    expect(pollVoteDocId('poll1', 'u:user1')).toBe('poll1__u:user1');
    expect(pollVoteDocId('poll1', 'u:user1')).toBe(pollVoteDocId('poll1', 'u:user1'));
    expect(pollVoteDocId('poll1', 'u:user2')).not.toBe(pollVoteDocId('poll1', 'u:user1'));
  });
});
