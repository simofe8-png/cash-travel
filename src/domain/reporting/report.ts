import { add, divRoundHalfUp, money, type Money } from '../money';
import { elapsedTripDays, isDuringTrip, type TripDetails } from '../trip';

/** How a reporting-currency value was obtained — shown to the user, never hidden. */
export type ValueBasis = 'EXACT' | 'REFERENCE' | 'CARD_ESTIMATE' | 'CARD_ACTUAL';

/** One trip cost converted to the reporting currency (or not convertible). */
export interface CostItem {
  readonly kind: 'CASH_EXPENSE' | 'CARD_EXPENSE' | 'ATM_FEE';
  readonly date: string;
  readonly categoryId: number | null;
  readonly original: Money;
  /** null = no rate available under the historical-rate policy. */
  readonly reporting: Money | null;
  readonly basis: ValueBasis | null;
  /** True when the value is an estimate (reference conversion or card estimate) rather than exact/actual. */
  readonly estimated: boolean;
}

export interface Total {
  readonly amount: Money;
  /** Items included in `amount`. */
  readonly count: number;
  /** Items that could not be converted, with their original-currency sums (never silently dropped). */
  readonly unavailableCount: number;
  readonly unavailable: readonly Money[];
  /** Number of included items whose value is estimated. */
  readonly estimatedCount: number;
}

export interface CategoryTotal {
  readonly categoryId: number;
  readonly total: Total;
}

export interface TripSpending {
  readonly reportingCurrency: string;
  /** Every trip cost regardless of date (prepaid and post-trip included). */
  readonly totalTripCost: Total;
  /** Costs dated inside the trip's [start, end]. */
  readonly duringTrip: Total;
  readonly preTrip: Total;
  readonly postTrip: Total;
  readonly today: Total;
  /** During-trip spending ÷ elapsed trip days; null before the trip starts. */
  readonly averagePerDay: { readonly amount: Money; readonly days: number; readonly partial: boolean } | null;
  /** Expense categories with non-zero spending only (zero-spend hidden), largest first. */
  readonly byCategory: readonly CategoryTotal[];
  readonly cash: Total;
  readonly card: Total;
  /** Local ATM fees (a trip cost, not an expense category). */
  readonly atmFees: Total;
}

export function totalOf(items: readonly CostItem[], currency: string): Total {
  let amount = money(0, currency);
  const unavailable = new Map<string, Money>();
  let count = 0;
  let unavailableCount = 0;
  let estimatedCount = 0;
  for (const i of items) {
    if (i.reporting) {
      amount = add(amount, i.reporting);
      count++;
      if (i.estimated) estimatedCount++;
    } else {
      unavailableCount++;
      const prev = unavailable.get(i.original.currency);
      unavailable.set(i.original.currency, prev ? add(prev, i.original) : i.original);
    }
  }
  return { amount, count, unavailableCount, unavailable: [...unavailable.values()], estimatedCount };
}

/**
 * Integer average: total ÷ days, rounded half away from zero at the minor unit.
 * Partial when some items could not be converted (the user sees it marked).
 */
function average(t: Total, days: number): { amount: Money; days: number; partial: boolean } | null {
  if (days <= 0) return null;
  const rounded = Number(divRoundHalfUp(BigInt(t.amount.minor), BigInt(days)));
  return { amount: money(rounded, t.amount.currency), days, partial: t.unavailableCount > 0 };
}

/** Pure aggregation of converted cost items into the trip spending report. No budget concept exists. */
export function summarizeSpending(items: readonly CostItem[], trip: Pick<TripDetails, 'startDate' | 'endDate' | 'reportingCurrency'>, today: string): TripSpending {
  const ccy = trip.reportingCurrency;
  const t = (pred: (i: CostItem) => boolean) => totalOf(items.filter(pred), ccy);
  const during = t((i) => isDuringTrip(trip, i.date));
  const categoryIds = [...new Set(items.filter((i) => i.categoryId !== null).map((i) => i.categoryId as number))];
  const byCategory = categoryIds
    .map((categoryId) => ({ categoryId, total: t((i) => i.categoryId === categoryId) }))
    .filter((c) => c.total.amount.minor !== 0 || c.total.unavailableCount > 0)
    .sort((a, b) => b.total.amount.minor - a.total.amount.minor || a.categoryId - b.categoryId);
  return {
    reportingCurrency: ccy,
    totalTripCost: t(() => true),
    duringTrip: during,
    preTrip: t((i) => i.date < trip.startDate),
    postTrip: t((i) => i.date > trip.endDate),
    today: t((i) => i.date === today),
    averagePerDay: average(during, elapsedTripDays(trip, today)),
    byCategory,
    cash: t((i) => i.kind === 'CASH_EXPENSE'),
    card: t((i) => i.kind === 'CARD_EXPENSE'),
    atmFees: t((i) => i.kind === 'ATM_FEE'),
  };
}
