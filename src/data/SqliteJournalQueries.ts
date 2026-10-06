import type { JournalFilter, JournalQueries, JournalRow } from '../application/ports/JournalQueries';
import type { SqlDatabase, SqlValue } from '../application/ports/SqlDatabase';

interface Row {
  id: number;
  type: JournalRow['type'];
  occurred_at: string;
  occurred_local_date: string;
  tz_offset_min: number;
  amount_minor: number;
  currency: string;
  counter_amount_minor: number | null;
  counter_currency: string | null;
  category_id: number | null;
  payment_method: 'CASH' | 'CARD' | null;
  card_id: number | null;
  fee_minor: number | null;
  description: string | null;
  place: string | null;
  note: string | null;
  has_receipt: number;
}

export class SqliteJournalQueries implements JournalQueries {
  constructor(private readonly db: SqlDatabase) {}

  list(tripId: number, filter: JournalFilter = {}): JournalRow[] {
    const params: SqlValue[] = [tripId];
    let sql = `SELECT t.id, t.type, t.occurred_at, t.occurred_local_date, t.tz_offset_min, t.amount_minor, t.currency,
                      t.counter_amount_minor, t.counter_currency, t.category_id, t.payment_method, t.card_id, t.fee_minor,
                      t.description, t.place, t.note, EXISTS (SELECT 1 FROM receipts r WHERE r.transaction_id = t.id) AS has_receipt
                 FROM transactions t
                WHERE t.trip_id = ? AND t.deleted_at IS NULL
                ORDER BY t.occurred_at DESC, t.id DESC`;
    if (filter.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }
    return this.db.all<Row>(sql, params).map((r) => ({
      id: r.id,
      type: r.type,
      occurredAt: r.occurred_at,
      localDate: r.occurred_local_date,
      tzOffsetMin: r.tz_offset_min,
      amountMinor: r.amount_minor,
      currency: r.currency,
      counterAmountMinor: r.counter_amount_minor,
      counterCurrency: r.counter_currency,
      categoryId: r.category_id,
      paymentMethod: r.payment_method,
      cardId: r.card_id,
      feeMinor: r.fee_minor,
      description: r.description,
      place: r.place,
      note: r.note,
      hasReceipt: r.has_receipt === 1,
    }));
  }
}
