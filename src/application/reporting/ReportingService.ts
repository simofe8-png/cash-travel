import { summarizeSpending, totalOf, type CostItem, type Total, type TripSpending, type ValueBasis } from '../../domain/reporting';
import { quoteRate } from '../../domain/fx';
import { money, type Decimal, type Money } from '../../domain/money';
import { localDateOf } from '../../domain/time';
import type { CardCostService } from '../cards/CardCostService';
import type { FxRateService, RateNeed } from '../fx/FxRateService';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { CostRow, ReportingQueries } from '../ports/ReportingQueries';
import type { TripRepository } from '../ports/TripRepository';

/** One amount's reference-rate equivalent with the rate that produced it (display only). */
export interface Equivalent {
  readonly amount: Money;
  readonly rate: { readonly from: string; readonly to: string; readonly rate: Decimal };
  readonly rateDate: string;
  readonly source: string;
  readonly stale: boolean;
}

export interface WalletView {
  readonly currency: string;
  readonly opening: Money;
  readonly current: Money;
  readonly negative: boolean;
  /** Current balance in the reporting currency at today's reference rate; null if unavailable. */
  readonly currentInReporting: Money | null;
}

/**
 * Reporting Engine: the single place that turns authoritative ledger data into Home/Summary/PDF
 * figures. Screens never compute financial values themselves. Read-only; uses only cached rates.
 */
export class ReportingService {
  constructor(
    private readonly trips: TripRepository,
    private readonly ledger: LedgerRepository,
    private readonly queries: ReportingQueries,
    private readonly fx: FxRateService,
    private readonly cardCost: CardCostService,
    private readonly clock: Clock,
  ) {}

  today(): string {
    return localDateOf(this.clock.now(), this.clock.offsetMinutes());
  }

  /** Physical cash wallets derived from the ledger (opening + current), negatives flagged. */
  wallets(tripId: number): WalletView[] {
    const trip = this.requireTrip(tripId);
    const today = this.today();
    return this.ledger
      .balances(tripId)
      .filter((b) => b.balanceMinor !== 0 || b.openingMinor !== 0)
      .map((b) => {
        const current = money(b.balanceMinor, b.currency);
        const conv = this.fx.convert(current, trip.reportingCurrency, today);
        return {
          currency: b.currency,
          opening: money(b.openingMinor, b.currency),
          current,
          negative: b.balanceMinor < 0,
          currentInReporting: conv.status === 'OK' ? conv.amount : null,
        };
      });
  }

  /** Reference-rate equivalent of one amount on a date (cached rates only); null when no rate is known. */
  equivalent(amount: Money, to: string, date: string): Equivalent | null {
    const c = this.fx.convert(amount, to, date);
    if (c.status !== 'OK') return null;
    return { amount: c.amount, rate: { from: c.quote.from, to: c.quote.to, rate: quoteRate(c.quote) }, rateDate: c.quote.rateDate, source: c.quote.source, stale: c.quote.stale };
  }

  /** Approximate reporting-currency equivalent of a set of amounts on a date (e.g. opening cash). */
  approximateEquivalent(amounts: readonly Money[], reportingCurrency: string, date: string): Total {
    return totalOf(
      amounts.map((a) => {
        const c = this.fx.convert(a, reportingCurrency, date);
        return {
          kind: 'CASH_EXPENSE' as const,
          date,
          categoryId: null,
          original: a,
          reporting: c.status === 'OK' ? c.amount : null,
          basis: c.status === 'OK' ? ('REFERENCE' as const) : null,
          estimated: a.currency !== reportingCurrency,
        };
      }),
      reportingCurrency,
    );
  }

  spending(tripId: number): TripSpending {
    const trip = this.requireTrip(tripId);
    const items = this.queries.costRows(tripId).map((r) => this.toItem(r, trip.reportingCurrency));
    return summarizeSpending(items, trip, this.today());
  }

  /** Journal daily totals: EXPENSE transactions only (no ATM fees, FX or ATM principal), per local date. */
  dailyExpenseTotals(tripId: number): Map<string, Total> {
    const trip = this.requireTrip(tripId);
    const items = this.queries
      .costRows(tripId)
      .filter((r) => r.kind !== 'ATM_FEE')
      .map((r) => this.toItem(r, trip.reportingCurrency));
    const byDate = new Map<string, CostItem[]>();
    for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
    return new Map([...byDate.entries()].map(([d, list]) => [d, totalOf(list, trip.reportingCurrency)]));
  }

  /** Rate needs for a background refresh: every (date, currency) in use, plus today for wallets/cards. */
  rateNeeds(tripId: number): RateNeed[] {
    const byDate = new Map<string, Set<string>>();
    const need = (date: string, c: string) => (byDate.get(date) ?? byDate.set(date, new Set()).get(date)!).add(c);
    for (const a of this.queries.activityCurrencies(tripId)) need(a.date, a.currency);
    for (const w of this.ledger.balances(tripId)) need(this.today(), w.currency);
    for (const r of this.queries.costRows(tripId)) if (r.billingCurrency) need(r.date, r.billingCurrency);
    return [...byDate.entries()].map(([date, set]) => ({ date, currencies: [...set] }));
  }

  private toItem(r: CostRow, ccy: string): CostItem {
    const original = money(r.amountMinor, r.currency);
    const base = { kind: r.kind, date: r.date, categoryId: r.categoryId, original };
    const conv = (m: Money, basis: ValueBasis, estimated: boolean): CostItem => {
      const c = this.fx.convert(m, ccy, r.date);
      if (c.status !== 'OK') return { ...base, reporting: null, basis: null, estimated: false };
      return { ...base, reporting: c.amount, basis, estimated: estimated || m.currency !== ccy };
    };
    if (r.kind !== 'CARD_EXPENSE') return conv(original, r.currency === ccy ? 'EXACT' : 'REFERENCE', false);

    // Card: actual charge → stored estimate → estimate from current cache → reference conversion.
    const billing = r.billingCurrency ?? 'ILS';
    if (r.actualMinor !== null) return conv(money(r.actualMinor, billing), 'CARD_ACTUAL', false);
    if (r.estimateMinor !== null) return conv(money(r.estimateMinor, billing), 'CARD_ESTIMATE', true);
    const chargedIn = r.chargedCurrency && r.chargedCurrency !== r.currency ? { currency: r.chargedCurrency, amountMinor: r.chargedAmountMinor } : null;
    const derived = this.cardCost.estimate({ original, chargedIn, cardId: r.cardId, date: r.date, kind: 'PURCHASE' });
    if (derived.status === 'ESTIMATED' && derived.estimateMinor !== null) {
      return conv(money(derived.estimateMinor, derived.billingCurrency), 'CARD_ESTIMATE', true);
    }
    return conv(original, 'REFERENCE', true);
  }

  private requireTrip(id: number) {
    const t = this.trips.get(id);
    if (!t) throw new Error(`Trip ${id} not found`);
    return t;
  }
}
