import { describe, expect, it } from 'vitest';
import { mapAdminPollDocument } from '../../src/services/adminPollMapping';

describe('mapAdminPollDocument', () => {
  it('maps Firestore timestamps and private admin poll fields into the admin view', () => {
    const poll = mapAdminPollDocument('poll-1', {
      question: 'Which project should be next?',
      description: 'Choose one.',
      notes: 'Organizer note',
      options: [
        { id: 'cleanup', label: 'Cleanup', order: 0 },
        { id: 'planting', label: 'Planting', order: 1 },
      ],
      status: 'published',
      audience: 'members',
      resultVisibility: 'afterVote',
      resultAudience: 'members',
      showParticipation: true,
      privateVotes: true,
      opensAt: { toMillis: () => 1_000 },
      closesAt: { toMillis: () => 9_000_000_000_000 },
      createdAt: { toMillis: () => 500 },
      updatedAt: { toMillis: () => 750 },
      tallies: { cleanup: 2, planting: 1 },
      totalVotes: 3,
    });

    expect(poll).toMatchObject({
      id: 'poll-1',
      notes: 'Organizer note',
      state: 'open',
      results: { cleanup: 2, planting: 1 },
      totalVotes: 3,
      participantCount: 3,
      canSeeResults: true,
      createdAt: 500,
      updatedAt: 750,
    });
  });

  it('normalizes malformed optional values without leaking Firestore objects', () => {
    const poll = mapAdminPollDocument('poll-2', {
      question: 'Draft poll',
      options: ['unexpected'],
      tallies: null,
    });

    expect(poll.status).toBe('draft');
    expect(poll.options).toEqual([{ id: '', label: '', order: 0 }]);
    expect(poll.results).toEqual({ '': 0 });
    expect(poll.createdAt).toBeNull();
  });
});
