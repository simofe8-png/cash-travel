/**
 * Deterministic calendar helpers. Instants are ISO-8601 UTC strings; calendar dates are
 * 'YYYY-MM-DD' strings compared lexicographically. A transaction's local date is fixed at entry
 * from the device's UTC offset at that moment, so later timezone changes never regroup history.
 */
import type { Occurrence } from '../ledger/types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

function toUtcMs(date: string): number {
  if (!isValidDate(date)) throw new Error(`Invalid date: ${date}`);
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** Calendar date at the given UTC offset (minutes east of UTC, e.g. Israel summer = 180). */
export function localDateOf(instant: string, offsetMin: number): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${instant}`);
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Builds an Occurrence for an instant observed at a UTC offset. */
export function occurrence(instant: string, offsetMin: number): Occurrence {
  return { occurredAt: new Date(Date.parse(instant)).toISOString(), occurredLocalDate: localDateOf(instant, offsetMin), tzOffsetMin: offsetMin };
}

/**
 * Builds an Occurrence for a user-chosen local calendar date and time ("HH:MM") at an offset.
 * The UTC instant is derived so that its local date equals the chosen date.
 */
export function occurrenceAtLocal(date: string, time: string, offsetMin: number): Occurrence {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error(`Invalid time: ${time}`);
  const [h, m] = time.split(':').map(Number) as [number, number];
  if (h > 23 || m > 59) throw new Error(`Invalid time: ${time}`);
  const ms = toUtcMs(date) + (h * 60 + m - offsetMin) * 60_000;
  return { occurredAt: new Date(ms).toISOString(), occurredLocalDate: date, tzOffsetMin: offsetMin };
}

/** Local "HH:MM" of an occurrence, as it was on the clock where it happened. */
export function localTimeOf(o: Occurrence): string {
  return new Date(Date.parse(o.occurredAt) + o.tzOffsetMin * 60_000).toISOString().slice(11, 16);
}
