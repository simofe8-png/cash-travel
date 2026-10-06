import type { CostRow, ReportingQueries } from '../application/ports/ReportingQueries';
import type { SqlDatabase } from '../application/ports/SqlDatabase';

interface Row {
  kind: CostRow['kind'];
  date: string;
  category_id: number | null;
  amount_minor: number;
  currency: string;
  card_id: number | null;
  billing_currency: string | null;
  charged_currency: string | null;
  charged_amount_minor: number | null;
  estimate_minor: number | null;
  actual_minor: number | null;
}

export class SqliteReportingQueries implements ReportingQueries {
  constructor(private readonly db: SqlDatabase) {}

  costRows(tripId: number): CostRow[] {
    return this.db
      .all<Row>(
        `SELECT 'CASH_EXPENSE' AS kind, occurred_local_date AS date, category_id, SUM(amount_minor) AS amount_minor, currency,
                NULL AS card_id, NULL AS billing_currency, NULL AS charged_currency, NULL AS charged_amount_minor,
                NULL AS estimate_minor, NULL AS actual_minor
           FROM transactions
          WHERE trip_id = ? AND deleted_at IS NULL AND type = 'EXPENSE' AND payment_method = 'CASH'
          GROUP BY occurred_local_date, currency, category_id
         UNION ALL
         SELECT 'CARD_EXPENSE', t.occurred_local_date, t.category_id, t.amount_minor, t.currency,
                t.card_id, c.billing_currency, c.charged_currency, c.charged_amount_minor,
                CASE WHEN c.estimate_status = 'ESTIMATED' THEN c.estimate_minor END, c.actual_minor
           FROM transactions t LEFT JOIN card_charges c ON c.transaction_id = t.id
          WHERE t.trip_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' AND t.payment_method = 'CARD'
         UNION ALL
         SELECT 'ATM_FEE', occurred_local_date, NULL, SUM(fee_minor), currency,
                NULL, NULL, NULL, NULL, NULL, NULL
           FROM transactions
          WHERE trip_id = ? AND deleted_at IS NULL AND type = 'ATM_WITHDRAWAL' AND fee_minor > 0
          GROUP BY occurred_local_date, currency`,
        [tripId, tripId, tripId],
      )
      .map((r) => ({
        kind: r.kind,
        date: r.date,
        categoryId: r.category_id,
        amountMinor: r.amount_minor,
        currency: r.currency,
        cardId: r.card_id,
        billingCurrency: r.billing_currency,
        chargedCurrency: r.charged_currency,
        chargedAmountMinor: r.charged_amount_minor,
        estimateMinor: r.estimate_minor,
        actualMinor: r.actual_minor,
      }));
  }

  activityCurrencies(tripId: number): { date: string; currency: string }[] {
    return this.db.all<{ date: string; currency: string }>(
      `SELECT DISTINCT occurred_local_date AS date, currency FROM transactions WHERE trip_id = ? AND deleted_at IS NULL
       UNION
       SELECT DISTINCT occurred_local_date, counter_currency FROM transactions
        WHERE trip_id = ? AND deleted_at IS NULL AND counter_currency IS NOT NULL`,
      [tripId, tripId],
    );
  }
}
