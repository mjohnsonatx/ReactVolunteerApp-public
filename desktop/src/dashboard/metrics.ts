// Pure helpers behind the overview page. Everything here takes plain data and a
// reference "now" so the numbers on the dashboard can be unit-tested.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Coerce a Firestore Timestamp, Date, ISO string, or epoch number into a Date. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const candidate = typeof (value as { toDate?: () => Date }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

/** Number of dates that fall inside the last `days` days (inclusive of now). */
export function countSince(dates: Array<Date | null>, days: number, now: Date = new Date()): number {
  const floor = now.getTime() - days * DAY_MS;
  return dates.reduce((total, date) => (date && date.getTime() > floor && date.getTime() <= now.getTime() ? total + 1 : total), 0);
}

/**
 * Bucket dates into rolling 7-day windows ending at `now`.
 * Returns `weeks` counts ordered oldest → newest; the last entry is the current week.
 */
export function weeklyCounts(dates: Array<Date | null>, weeks: number, now: Date = new Date()): number[] {
  const end = now.getTime();
  const counts = new Array<number>(weeks).fill(0);
  dates.forEach(date => {
    if (!date) return;
    const age = end - date.getTime();
    if (age < 0) return;
    const index = Math.floor(age / WEEK_MS);
    if (index < weeks) counts[weeks - 1 - index] += 1;
  });
  return counts;
}

/** Short label for the start of each rolling week, oldest → newest. */
export function weekLabels(weeks: number, now: Date = new Date(), locale?: string): string[] {
  return Array.from({ length: weeks }, (_, position) => {
    const weeksAgo = weeks - 1 - position;
    const start = new Date(now.getTime() - (weeksAgo + 1) * WEEK_MS + DAY_MS);
    return start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  });
}

/** Every forum post and reply as a date, so activity counts posts and replies alike. */
export function forumActivityDates(posts: any[]): Array<Date | null> {
  const output: Array<Date | null> = [];
  (posts || []).forEach(post => {
    output.push(toDate(post?.createdAt));
    (post?.replies || []).forEach((reply: any) => output.push(toDate(reply?.createdAt ?? reply?.date)));
  });
  return output;
}

/** Events dated today or later, soonest first. */
export function upcomingEvents(events: any[], now: Date = new Date(), limit = 6): any[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return [...(events || [])]
    .filter(event => {
      const date = new Date(`${event?.date}T12:00:00`);
      return !Number.isNaN(date.getTime()) && date.getTime() >= today;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);
}

/** Compact number formatting for stat tiles: 1284 → "1.3K". */
export function compactNumber(value: number, locale?: string): string {
  if (Math.abs(value) < 10_000) return value.toLocaleString(locale);
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** "Good morning" / "Good afternoon" / "Good evening" for the overview greeting. */
export function greetingFor(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Round an axis maximum up to a friendly tick ceiling and return the tick values. */
export function niceTicks(maxValue: number, tickCount = 4): number[] {
  const max = Math.max(1, maxValue);
  const rawStep = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  // Counts are integers, so never step by less than one.
  const step = Math.max(1, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude);
  const ticks: number[] = [];
  for (let tick = 0; tick <= Math.ceil(max / step) * step; tick += step) ticks.push(tick);
  return ticks;
}
