import { describe, expect, it } from 'vitest';
import {
  compactNumber, countSince, forumActivityDates, greetingFor, niceTicks, toDate, upcomingEvents, weekLabels, weeklyCounts,
} from './metrics';

const NOW = new Date('2026-09-18T15:00:00');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('toDate', () => {
  it('accepts Firestore timestamps, dates, strings, and rejects junk', () => {
    expect(toDate({ toDate: () => NOW })).toEqual(NOW);
    expect(toDate(NOW)).toEqual(NOW);
    expect(toDate('2026-09-18T15:00:00')).toEqual(NOW);
    expect(toDate('not a date')).toBeNull();
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});

describe('countSince', () => {
  it('counts only dates inside the window and ignores the future', () => {
    const dates = [daysAgo(1), daysAgo(29), daysAgo(31), daysAgo(-1), null];
    expect(countSince(dates, 30, NOW)).toBe(2);
  });
});

describe('weeklyCounts', () => {
  it('buckets into rolling weeks, oldest first, with the current week last', () => {
    const dates = [daysAgo(0), daysAgo(6), daysAgo(7), daysAgo(20), daysAgo(90), null];
    expect(weeklyCounts(dates, 4, NOW)).toEqual([0, 1, 1, 2]);
  });

  it('returns all zeros for empty input', () => {
    expect(weeklyCounts([], 3, NOW)).toEqual([0, 0, 0]);
  });
});

describe('weekLabels', () => {
  it('produces one label per week ending with the current week', () => {
    const labels = weekLabels(3, NOW, 'en-US');
    expect(labels).toHaveLength(3);
    expect(labels[2]).toBe('Sep 12');
    expect(labels[0]).toBe('Aug 29');
  });
});

describe('forumActivityDates', () => {
  it('includes posts and their replies', () => {
    const posts = [
      { createdAt: { toDate: () => daysAgo(1) }, replies: [{ date: '2026-09-17' }, { createdAt: daysAgo(2) }] },
      { createdAt: null },
    ];
    const dates = forumActivityDates(posts);
    expect(dates).toHaveLength(4);
    expect(dates.filter(Boolean)).toHaveLength(3);
  });
});

describe('upcomingEvents', () => {
  it('keeps today and future events sorted by date and drops the past', () => {
    const events = [
      { id: 'later', date: '2026-10-02' },
      { id: 'past', date: '2026-09-17' },
      { id: 'today', date: '2026-09-18' },
      { id: 'bad', date: 'nope' },
    ];
    expect(upcomingEvents(events, NOW).map(event => event.id)).toEqual(['today', 'later']);
    expect(upcomingEvents(events, NOW, 1).map(event => event.id)).toEqual(['today']);
  });
});

describe('compactNumber', () => {
  it('keeps small numbers exact and compacts large ones', () => {
    expect(compactNumber(1284, 'en-US')).toBe('1,284');
    expect(compactNumber(12_900, 'en-US')).toBe('12.9K');
  });
});

describe('greetingFor', () => {
  it('changes with the hour', () => {
    expect(greetingFor(new Date('2026-09-18T08:00:00'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-09-18T13:00:00'))).toBe('Good afternoon');
    expect(greetingFor(new Date('2026-09-18T20:00:00'))).toBe('Good evening');
  });
});

describe('niceTicks', () => {
  it('rounds to clean steps and always starts at zero', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(23)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
  });
});
