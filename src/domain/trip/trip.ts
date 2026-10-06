import { isSupportedCurrency } from '../money';
import { addDays, daysBetween, isValidDate } from '../time/dates';

export interface TripDetails {
  readonly name: string;
  /** Inclusive date-only boundaries ('YYYY-MM-DD'). */
  readonly startDate: string;
  readonly endDate: string;
  readonly reportingCurrency: string;
}

export interface Trip extends TripDetails {
  readonly id: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TripStatus = 'UPCOMING' | 'CURRENT' | 'COMPLETED';

export type TripViolation = 'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'INVALID_START' | 'INVALID_END' | 'END_BEFORE_START' | 'UNSUPPORTED_CURRENCY';

export const TRIP_NAME_MAX = 80;

export function validateTripDetails(t: TripDetails): TripViolation[] {
  const v: TripViolation[] = [];
  const name = t.name.trim();
  if (name.length === 0) v.push('NAME_REQUIRED');
  if (name.length > TRIP_NAME_MAX) v.push('NAME_TOO_LONG');
  if (!isValidDate(t.startDate)) v.push('INVALID_START');
  if (!isValidDate(t.endDate)) v.push('INVALID_END');
  if (isValidDate(t.startDate) && isValidDate(t.endDate) && t.endDate < t.startDate) v.push('END_BEFORE_START');
  if (!isSupportedCurrency(t.reportingCurrency)) v.push('UNSUPPORTED_CURRENCY');
  return v;
}

export function tripStatus(t: Pick<TripDetails, 'startDate' | 'endDate'>, today: string): TripStatus {
  if (today < t.startDate) return 'UPCOMING';
  if (today > t.endDate) return 'COMPLETED';
  return 'CURRENT';
}

/** Number of calendar days in the trip, inclusive. Prepaid (pre-trip) expenses never extend it. */
export function tripDayCount(t: Pick<TripDetails, 'startDate' | 'endDate'>): number {
  return daysBetween(t.startDate, t.endDate) + 1;
}

/** 1-based day number of `date` within the trip, or null when outside the trip. */
export function tripDayNumber(t: Pick<TripDetails, 'startDate' | 'endDate'>, date: string): number | null {
  if (date < t.startDate || date > t.endDate) return null;
  return daysBetween(t.startDate, date) + 1;
}

export function isDuringTrip(t: Pick<TripDetails, 'startDate' | 'endDate'>, date: string): boolean {
  return date >= t.startDate && date <= t.endDate;
}

/**
 * Elapsed trip days as of `today` for average-per-day: days from start through min(today, end).
 * Zero before the trip starts (average is then not meaningful).
 */
export function elapsedTripDays(t: Pick<TripDetails, 'startDate' | 'endDate'>, today: string): number {
  if (today < t.startDate) return 0;
  const last = today > t.endDate ? t.endDate : today;
  return daysBetween(t.startDate, last) + 1;
}

/**
 * The trip shown by default: a current trip (latest start), else the nearest upcoming, else the
 * most recently ended.
 */
export function defaultTripId(trips: readonly Trip[], today: string): number | null {
  const current = trips.filter((t) => tripStatus(t, today) === 'CURRENT').sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (current[0]) return current[0].id;
  const upcoming = trips.filter((t) => tripStatus(t, today) === 'UPCOMING').sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming[0]) return upcoming[0].id;
  const done = [...trips].sort((a, b) => b.endDate.localeCompare(a.endDate));
  return done[0]?.id ?? null;
}

export { addDays };
