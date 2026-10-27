import type { PollView } from '../services/adminPollMapping';

// Events are calendar dates in Austin, even when a visitor is in another timezone.
export function upcomingEvents<T extends { id: string; date?: string }>(events: T[], now = new Date()): T[] {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return events.filter(event => {
    if (!event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return false;
    const parsed = new Date(`${event.date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime())
      && parsed.toISOString().slice(0, 10) === event.date
      && event.date >= today;
  }).sort((a, b) => a.date!.localeCompare(b.date!));
}

export function currentPolls(polls: PollView[], now = Date.now()): PollView[] {
  return polls.filter(poll => poll.state === 'open'
    && (poll.opensAt === null || poll.opensAt <= now)
    && (poll.closesAt === null || poll.closesAt > now))
    .sort((a, b) => (a.closesAt ?? Infinity) - (b.closesAt ?? Infinity));
}
