import type { FxRateRepository } from '../application/ports/FxRateRepository';
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { PIVOT_CURRENCY, type ReferenceRate } from '../domain/fx';
import { inTransaction } from './db/transaction';

export class SqliteFxRateRepository implements FxRateRepository {
  constructor(private readonly db: SqlDatabase) {}

  save(rates: readonly ReferenceRate[], fetchedAt: string): number {
    return inTransaction(this.db, () => {
      let inserted = 0;
      for (const r of rates) {
        inserted += this.db.run(
          `INSERT INTO fx_rates (source, base, quote, rate, rate_date, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (source, base, quote, rate_date) DO NOTHING`,
          [r.source, PIVOT_CURRENCY, r.quote, r.rate, r.rateDate, fetchedAt],
        ).changes;
      }
      return inserted;
    });
  }

  find(currencies: readonly string[], fromDate: string, toDate: string): ReferenceRate[] {
    const list = currencies.filter((c) => c !== PIVOT_CURRENCY);
    if (list.length === 0) return [];
    return this.db
      .all<{ source: string; quote: string; rate: string; rate_date: string }>(
        `SELECT source, quote, rate, rate_date FROM fx_rates
          WHERE base = ? AND quote IN (${list.map(() => '?').join(',')}) AND rate_date BETWEEN ? AND ?`,
        [PIVOT_CURRENCY, ...list, fromDate, toDate],
      )
      .map((r) => ({ source: r.source, quote: r.quote, rate: r.rate, rateDate: r.rate_date }));
  }
}
