/** Cost-relevant rows for reporting (aggregated where possible; never whole ledger rows). */
export interface CostRow {
  readonly kind: 'CASH_EXPENSE' | 'CARD_EXPENSE' | 'ATM_FEE';
  readonly date: string;
  readonly categoryId: number | null;
  readonly amountMinor: number;
  readonly currency: string;
  /** Card expenses only. */
  readonly cardId: number | null;
  readonly billingCurrency: string | null;
  readonly chargedCurrency: string | null;
  readonly chargedAmountMinor: number | null;
  readonly estimateMinor: number | null;
  readonly actualMinor: number | null;
}

export interface ReportingQueries {
  /** Active trip costs: cash expenses grouped by (date, currency, category); card expenses per transaction; ATM fees grouped by (date, currency). */
  costRows(tripId: number): CostRow[];
  /** Distinct (local date, currency) pairs of active transactions in the trip. */
  activityCurrencies(tripId: number): { date: string; currency: string }[];
}
