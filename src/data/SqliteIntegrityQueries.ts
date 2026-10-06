import type { IntegrityQueries } from '../application/ports/IntegrityQueries';
import type { SqlDatabase } from '../application/ports/SqlDatabase';

export class SqliteIntegrityQueries implements IntegrityQueries {
  constructor(private readonly db: SqlDatabase) {}

  quickCheck(): string {
    return this.db.get<{ quick_check: string }>('PRAGMA quick_check')?.quick_check ?? 'unknown';
  }

  foreignKeyViolations(): number {
    return this.db.all('PRAGMA foreign_key_check').length;
  }

  tripIds(): number[] {
    return this.db.all<{ id: number }>('SELECT id FROM trips ORDER BY id').map((r) => r.id);
  }

  misplacedCardCharges(): number[] {
    return this.db
      .all<{ id: number }>(
        `SELECT t.id FROM card_charges c JOIN transactions t ON t.id = c.transaction_id
          WHERE NOT ((t.type = 'EXPENSE' AND t.payment_method = 'CARD') OR t.type = 'ATM_WITHDRAWAL')`,
      )
      .map((r) => r.id);
  }

  crossTripEntries(): number {
    return (
      this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id
           JOIN cash_wallets w ON w.id = e.wallet_id WHERE w.trip_id <> t.trip_id`,
      )?.n ?? 0
    );
  }
}
