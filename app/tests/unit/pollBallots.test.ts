import { describe, expect, it } from 'vitest';
import { pollVoteOptionIds, validatePoll, validatePollBallot } from '@watershed/shared';
import { ballotPoints } from '../../../functions/src/lib/pollBallot';

const options = [{ id: 'sat', label: 'Saturday' }, { id: 'sun', label: 'Sunday' }, { id: 'mon', label: 'Monday' }];
const base = { question: 'When can you help?', options };

describe('poll ballots', () => {
  it('defaults old polls and ballots to single choice', () => {
    expect(validatePoll(base).poll).toMatchObject({ votingMode: 'single', maxRankedChoices: null });
    expect(pollVoteOptionIds({ optionId: 'sat' })).toEqual(['sat']);
    expect(validatePollBallot(base, ['sat', 'sun']).ok).toBe(false);
  });
  it('permits every available option in a multiple-choice ballot, in canonical order', () => {
    expect(validatePollBallot({ ...base, votingMode: 'multiple' }, ['mon', 'sat', 'sun']))
      .toEqual({ ok: true, reason: '', optionIds: ['sat', 'sun', 'mon'] });
  });
  it.each([0, -1, 1.5, 4, NaN, '2', null, undefined])('rejects invalid ranking limit %s', maxRankedChoices => {
    expect(validatePoll({ ...base, votingMode: 'ranked', maxRankedChoices }).ok).toBe(false);
  });
  it('requires a known voting method', () => {
    expect(validatePoll({ ...base, votingMode: 'anything' }).ok).toBe(false);
  });
  it.each([[], ['sat', 'sat'], ['missing'], ['sat', 1], 'sat', null])('rejects malformed ballots %j', ballot => {
    expect(validatePollBallot({ ...base, votingMode: 'multiple' }, ballot).ok).toBe(false);
  });
  it('preserves preference order, allows fewer than K, and rejects too many choices', () => {
    const poll = { ...base, votingMode: 'ranked', maxRankedChoices: 2 };
    expect(validatePoll(poll).ok).toBe(true);
    expect(validatePollBallot(poll, ['sun', 'sat']).optionIds).toEqual(['sun', 'sat']);
    expect(validatePollBallot(poll, ['sun']).ok).toBe(true);
    expect(validatePollBallot(poll, ['sat', 'sun', 'mon']).ok).toBe(false);
    expect(ballotPoints(poll, ['sun', 'sat'])).toEqual({ sun: 2, sat: 1 });
    expect(ballotPoints(poll, ['sun'])).toEqual({ sun: 2 });
  });
  it('counts each multi-select option equally', () => {
    expect(ballotPoints({ votingMode: 'multiple' }, ['sun', 'sat'])).toEqual({ sun: 1, sat: 1 });
  });
});
