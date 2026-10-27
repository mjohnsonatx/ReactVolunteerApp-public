import { describe, expect, it } from 'vitest';
import { currentPolls, upcomingEvents } from '../../src/utils/homeActivity';
import { mapAdminPollDocument } from '../../src/services/adminPollMapping';

describe('home activity selection', () => {
  it('keeps today in Austin near UTC midnight, sorts events, and rejects past or invalid dates', () => {
    const events = [
      { id: 'later', date: '2026-09-20' },
      { id: 'today', date: '2026-09-14' },
      { id: 'past', date: '2026-09-13' },
      { id: 'tomorrow', date: '2026-09-15' },
      { id: 'invalid', date: '2026-02-30' },
      { id: 'missing' },
      { id: 'malformed', date: 'not-a-date' },
    ];
    expect(upcomingEvents(events, new Date('2026-09-15T02:00:00Z')).map(event => event.id))
      .toEqual(['today', 'tomorrow', 'later']);
    expect(events[0].id).toBe('later');
    expect(upcomingEvents(events, new Date('2026-09-15T05:00:00Z')).map(event => event.id))
      .toEqual(['tomorrow', 'later']);
  });

  it('shows only currently open polls, with closing-soon polls first', () => {
    const now = 1000;
    const make = (id, state, opensAt = null, closesAt = null) => ({
      ...mapAdminPollDocument(id, {}), state, opensAt, closesAt,
    });
    const polls = [make('no-deadline', 'open'), make('later', 'open', null, 3000),
      make('closing-soon', 'open', 500, 2000), make('closed', 'closed'),
      make('draft', 'draft'), make('archived', 'archived'), make('upcoming', 'upcoming'),
      make('just-closed', 'open', null, now), make('not-yet-open', 'open', 1500)];
    expect(currentPolls(polls, now).map(poll => poll.id)).toEqual(['closing-soon', 'later', 'no-deadline']);
    expect(polls[0].id).toBe('no-deadline');
  });
});
