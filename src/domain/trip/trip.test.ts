import { addDays, daysBetween, isValidDate, localDateOf, localTimeOf, occurrence, occurrenceAtLocal } from '../time';
import { defaultTripId, elapsedTripDays, isDuringTrip, tripDayCount, tripDayNumber, tripStatus, validateTripDetails, type Trip } from './trip';

describe('dates', () => {
  it('validates calendar dates strictly', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('26-01-01')).toBe(false);
  });

  it('adds days across month/year/DST boundaries deterministically', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-27', 3)).toBe('2026-03-30'); // Israel DST change weekend
    expect(daysBetween('2026-11-01', '2026-11-20')).toBe(19);
  });

  it('derives the local date at the offset where it happened', () => {
    // 23:30 UTC on Nov 1 is Nov 2 in Bangkok (+7) but Nov 1 in New York (−5)
    expect(localDateOf('2026-11-01T23:30:00.000Z', 420)).toBe('2026-11-02');
    expect(localDateOf('2026-11-01T23:30:00.000Z', -300)).toBe('2026-11-01');
    expect(occurrence('2026-11-01T23:30:00.000Z', 420)).toEqual({
      occurredAt: '2026-11-01T23:30:00.000Z',
      occurredLocalDate: '2026-11-02',
      tzOffsetMin: 420,
    });
  });

  it('builds an occurrence from a chosen local date/time and reads it back', () => {
    const o = occurrenceAtLocal('2026-11-02', '00:15', 420);
    expect(o.occurredAt).toBe('2026-11-01T17:15:00.000Z');
    expect(o.occurredLocalDate).toBe('2026-11-02');
    expect(localTimeOf(o)).toBe('00:15');
    expect(() => occurrenceAtLocal('2026-11-02', '24:00', 0)).toThrow();
  });
});

describe('trip rules', () => {
  const trip = { startDate: '2026-11-01', endDate: '2026-11-20' };

  it('validates details', () => {
    expect(validateTripDetails({ name: 'תאילנד', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' })).toEqual([]);
    expect(validateTripDetails({ name: '  ', startDate: '2026-11-05', endDate: '2026-11-01', reportingCurrency: 'XXX' })).toEqual([
      'NAME_REQUIRED',
      'END_BEFORE_START',
      'UNSUPPORTED_CURRENCY',
    ]);
    expect(validateTripDetails({ name: 'x'.repeat(81), startDate: 'bad', endDate: '2026-11-01', reportingCurrency: 'ILS' })).toEqual([
      'NAME_TOO_LONG',
      'INVALID_START',
    ]);
  });

  it('classifies status by local today', () => {
    expect(tripStatus(trip, '2026-10-31')).toBe('UPCOMING');
    expect(tripStatus(trip, '2026-11-01')).toBe('CURRENT');
    expect(tripStatus(trip, '2026-11-20')).toBe('CURRENT');
    expect(tripStatus(trip, '2026-11-21')).toBe('COMPLETED');
  });

  it('counts days inclusively; pre-trip dates are outside', () => {
    expect(tripDayCount(trip)).toBe(20);
    expect(tripDayCount({ startDate: '2026-11-01', endDate: '2026-11-01' })).toBe(1);
    expect(tripDayNumber(trip, '2026-11-01')).toBe(1);
    expect(tripDayNumber(trip, '2026-11-20')).toBe(20);
    expect(tripDayNumber(trip, '2026-10-15')).toBeNull();
    expect(isDuringTrip(trip, '2026-10-15')).toBe(false);
    expect(isDuringTrip(trip, '2026-11-10')).toBe(true);
  });

  it('elapsed days for average-per-day', () => {
    expect(elapsedTripDays(trip, '2026-10-30')).toBe(0);
    expect(elapsedTripDays(trip, '2026-11-05')).toBe(5);
    expect(elapsedTripDays(trip, '2026-12-25')).toBe(20);
  });

  it('chooses the most relevant default trip', () => {
    const mk = (id: number, s: string, e: string): Trip => ({ id, name: `${id}`, startDate: s, endDate: e, reportingCurrency: 'ILS', createdAt: '', updatedAt: '' });
    const past = mk(1, '2026-01-01', '2026-01-10');
    const later = mk(2, '2027-03-01', '2027-03-10');
    const soon = mk(3, '2026-12-01', '2026-12-05');
    const now = mk(4, '2026-11-01', '2026-11-20');
    expect(defaultTripId([past, later, soon, now], '2026-11-05')).toBe(4);
    expect(defaultTripId([past, later, soon], '2026-11-05')).toBe(3);
    expect(defaultTripId([past], '2026-11-05')).toBe(1);
    expect(defaultTripId([], '2026-11-05')).toBeNull();
  });
});
