import { convertByRatio, parseDecimal, type Decimal, type Money } from '../money';
import { addDays, daysBetween } from '../time/dates';

/**
 * Reference (market) rates — used only for estimates and reporting, never for actual exchanges.
 * All cached rates are quoted against one pivot: 1 EUR = rate × quote currency.
 */
export const PIVOT_CURRENCY = 'EUR';

/** A provider rate as cached locally, with provenance. */
export interface ReferenceRate {
  readonly source: string;
  readonly quote: string;
  /** Canonical decimal string; 1 EUR = rate quote. */
  readonly rate: string;
  /** Effective (publication) date of the rate. */
  readonly rateDate: string;
}

/**
 * Historical-rate policy (ADR-0004): the reference rate for local date D is the most recent
 * published rate dated within [D − 7 days, D]. Weekends/holidays fall back to the prior
 * publication; anything older is "unavailable" — never invented or extrapolated.
 */
export const RATE_WINDOW_DAYS = 7;
/** A rate older than this many days before D is shown as stale (still within the window). */
export const RATE_STALE_DAYS = 3;

export interface RateQuote {
  readonly from: string;
  readonly to: string;
  /** rate(from→to) = numerator / denominator (exact; no intermediate rounding). */
  readonly numerator: Decimal;
  readonly denominator: Decimal;
  readonly rateDate: string;
  readonly source: string;
  /** Days between the requested date and the rate's effective date. */
  readonly ageDays: number;
  readonly stale: boolean;
}

export function windowStart(date: string): string {
  return addDays(date, -RATE_WINDOW_DAYS);
}

const ONE: Decimal = { coef: 1n, scale: 0 };

/**
 * Builds the cross quote from→to for date D from candidate EUR-based rates (any dates/sources).
 * Both legs must come from the same source and the same publication date. Sources earlier in
 * `sourcePriority` win; within a source the most recent date in the window wins.
 */
export function resolveQuote(
  from: string,
  to: string,
  date: string,
  candidates: readonly ReferenceRate[],
  sourcePriority: readonly string[],
): RateQuote | null {
  if (from === to) {
    return { from, to, numerator: ONE, denominator: ONE, rateDate: date, source: 'IDENTITY', ageDays: 0, stale: false };
  }
  const start = windowStart(date);
  for (const source of sourcePriority) {
    const usable = candidates.filter((r) => r.source === source && r.rateDate <= date && r.rateDate >= start);
    const dates = [...new Set(usable.map((r) => r.rateDate))].sort().reverse();
    for (const d of dates) {
      const leg = (c: string): Decimal | null => {
        if (c === PIVOT_CURRENCY) return ONE;
        const r = usable.find((x) => x.rateDate === d && x.quote === c);
        return r ? parseDecimal(r.rate) : null;
      };
      const eurToFrom = leg(from);
      const eurToTo = leg(to);
      if (eurToFrom && eurToTo) {
        const age = daysBetween(d, date);
        // amount_to = amount_from × (EUR→to) / (EUR→from)
        return { from, to, numerator: eurToTo, denominator: eurToFrom, rateDate: d, source, ageDays: age, stale: age > RATE_STALE_DAYS };
      }
    }
  }
  return null;
}

export function convertWithQuote(m: Money, q: RateQuote): Money {
  if (m.currency !== q.from) throw new Error(`Quote is for ${q.from}, amount is ${m.currency}`);
  return convertByRatio(m, q.numerator, q.denominator, q.to);
}
