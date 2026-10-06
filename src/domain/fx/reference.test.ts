import { money, toDecimalString, divide } from '../money';
import { convertWithQuote, resolveQuote, type ReferenceRate } from './reference';

const ecb = (quote: string, rate: string, rateDate: string): ReferenceRate => ({ source: 'ECB', quote, rate, rateDate });
const sec = (quote: string, rate: string, rateDate: string): ReferenceRate => ({ source: 'CURRENCY_API', quote, rate, rateDate });
const PRIORITY = ['ECB', 'CURRENCY_API'];

const rates = [
  ecb('ILS', '3.4408', '2026-10-02'), // Friday
  ecb('THB', '37.71', '2026-10-02'),
  ecb('USD', '1.1225', '2026-10-02'),
  ecb('ILS', '3.431', '2026-10-05'), // Monday
  ecb('THB', '37.752', '2026-10-05'),
  sec('VND', '29261.61768248', '2026-10-03'),
  sec('ILS', '3.43520952', '2026-10-03'),
  sec('THB', '37.73543749', '2026-10-03'),
];

describe('reference rate policy', () => {
  it('identity for same currency', () => {
    const q = resolveQuote('ILS', 'ILS', '2026-10-05', [], PRIORITY)!;
    expect(convertWithQuote(money(12345, 'ILS'), q)).toEqual(money(12345, 'ILS'));
  });

  it('EUR legs use the pivot directly', () => {
    const q = resolveQuote('EUR', 'ILS', '2026-10-05', rates, PRIORITY)!;
    expect(convertWithQuote(money(10000, 'EUR'), q)).toEqual(money(34310, 'ILS'));
    const back = resolveQuote('ILS', 'EUR', '2026-10-05', rates, PRIORITY)!;
    expect(convertWithQuote(money(34310, 'ILS'), back)).toEqual(money(10000, 'EUR'));
  });

  it('cross rate via EUR without intermediate rounding', () => {
    const q = resolveQuote('THB', 'ILS', '2026-10-05', rates, PRIORITY)!;
    // 85,000 THB × 3.431 / 37.752 = 7725.0211909… → 7725.02
    expect(convertWithQuote(money(8500000, 'THB'), q)).toEqual(money(772502, 'ILS'));
    expect(q).toMatchObject({ rateDate: '2026-10-05', source: 'ECB', ageDays: 0, stale: false });
    expect(toDecimalString(divide(q.numerator, q.denominator, 6))).toBe('0.090883');
  });

  it('weekend dates use the prior publication (ECB preferred over secondary)', () => {
    const q = resolveQuote('THB', 'ILS', '2026-10-04', rates, PRIORITY)!; // Sunday
    expect(q).toMatchObject({ rateDate: '2026-10-02', source: 'ECB', ageDays: 2, stale: false });
  });

  it('falls back to the secondary source only for currencies ECB lacks', () => {
    const q = resolveQuote('VND', 'ILS', '2026-10-04', rates, PRIORITY)!;
    expect(q).toMatchObject({ source: 'CURRENCY_API', rateDate: '2026-10-03' });
    expect(convertWithQuote(money(100000000, 'VND'), q).currency).toBe('ILS');
  });

  it('both legs must come from the same source and publication date', () => {
    const mixed = [ecb('ILS', '3.4', '2026-10-02'), ecb('THB', '37', '2026-10-01')];
    expect(resolveQuote('THB', 'ILS', '2026-10-02', mixed, PRIORITY)).toBeNull();
  });

  it('marks stale beyond 3 days and is unavailable beyond 7 days — never extrapolated', () => {
    expect(resolveQuote('THB', 'ILS', '2026-10-09', rates, PRIORITY)).toMatchObject({ rateDate: '2026-10-05', ageDays: 4, stale: true });
    expect(resolveQuote('THB', 'ILS', '2026-10-13', rates, PRIORITY)).toBeNull();
  });

  it('never uses a rate published after the requested date', () => {
    expect(resolveQuote('THB', 'ILS', '2026-10-01', rates, PRIORITY)).toBeNull();
  });

  it('unknown currency is unavailable', () => {
    expect(resolveQuote('JOD', 'ILS', '2026-10-05', rates, PRIORITY)).toBeNull();
  });
});
