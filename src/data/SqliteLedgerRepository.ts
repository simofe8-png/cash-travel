import type { LedgerRepository } from '../application/ports/LedgerRepository';
import type { SqlDatabase, SqlValue } from '../application/ports/SqlDatabase';
import {
  cashEffects,
  LedgerValidationError,
  validateDraft,
  type CardCharge,
  type CardChargeEstimate,
  type StoredTransaction,
  type TransactionDraft,
  type WalletBalance,
} from '../domain/ledger';
import { money } from '../domain/money';
import { inTransaction } from './db/transaction';

export interface TransactionRow {
  id: number;
  trip_id: number;
  type: TransactionDraft['type'];
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
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CardChargeRow {
  billing_currency: string;
  charged_currency: string;
  charged_amount_minor: number | null;
  estimate_status: 'ESTIMATED' | 'UNAVAILABLE';
  estimate_minor: number | null;
  estimate_fee_status: 'INCLUDED' | 'NONE' | 'UNKNOWN';
  estimate_rate: string | null;
  estimate_rate_source: string | null;
  estimate_rate_date: string | null;
  rule_set_version: string | null;
  rule_id: string | null;
  estimated_at: string | null;
  actual_minor: number | null;
  actual_entered_at: string | null;
}

type Columns = Omit<TransactionRow, 'id' | 'revision' | 'created_at' | 'updated_at' | 'deleted_at'>;

function toColumns(d: TransactionDraft): Columns {
  const base = {
    trip_id: d.tripId,
    type: d.type,
    occurred_at: d.occurredAt,
    occurred_local_date: d.occurredLocalDate,
    tz_offset_min: d.tzOffsetMin,
    counter_amount_minor: null,
    counter_currency: null,
    category_id: null,
    payment_method: null,
    card_id: null,
    fee_minor: null,
    description: d.description?.trim() || null,
    place: d.place?.trim() || null,
    note: d.note?.trim() || null,
  };
  switch (d.type) {
    case 'OPENING_BALANCE':
      return { ...base, amount_minor: d.amount.minor, currency: d.amount.currency };
    case 'EXPENSE':
      return {
        ...base,
        amount_minor: d.amount.minor,
        currency: d.amount.currency,
        category_id: d.categoryId,
        payment_method: d.payment.method,
        card_id: d.payment.method === 'CARD' ? d.payment.cardId : null,
      };
    case 'FX_EXCHANGE':
      return {
        ...base,
        amount_minor: d.given.minor,
        currency: d.given.currency,
        counter_amount_minor: d.received.minor,
        counter_currency: d.received.currency,
      };
    case 'ATM_WITHDRAWAL':
      return {
        ...base,
        amount_minor: d.received.minor,
        currency: d.received.currency,
        card_id: d.cardId,
        fee_minor: d.fee ? d.fee.minor : null,
      };
    case 'CASH_ADJUSTMENT':
      return { ...base, amount_minor: d.delta.minor, currency: d.delta.currency };
  }
}

export function rowToDraft(r: TransactionRow): TransactionDraft {
  const common = {
    tripId: r.trip_id,
    occurredAt: r.occurred_at,
    occurredLocalDate: r.occurred_local_date,
    tzOffsetMin: r.tz_offset_min,
    description: r.description,
    place: r.place,
    note: r.note,
  };
  switch (r.type) {
    case 'OPENING_BALANCE':
      return { ...common, type: r.type, amount: money(r.amount_minor, r.currency) };
    case 'EXPENSE':
      return {
        ...common,
        type: r.type,
        amount: money(r.amount_minor, r.currency),
        categoryId: r.category_id as number,
        payment: r.payment_method === 'CARD' ? { method: 'CARD', cardId: r.card_id } : { method: 'CASH' },
      };
    case 'FX_EXCHANGE':
      return {
        ...common,
        type: r.type,
        given: money(r.amount_minor, r.currency),
        received: money(r.counter_amount_minor as number, r.counter_currency as string),
      };
    case 'ATM_WITHDRAWAL':
      return {
        ...common,
        type: r.type,
        received: money(r.amount_minor, r.currency),
        fee: r.fee_minor === null ? null : money(r.fee_minor, r.currency),
        cardId: r.card_id,
      };
    case 'CASH_ADJUSTMENT':
      return { ...common, type: r.type, delta: money(r.amount_minor, r.currency) };
  }
}

function rowToCardCharge(r: CardChargeRow): CardCharge {
  return {
    billingCurrency: r.billing_currency,
    chargedCurrency: r.charged_currency,
    chargedAmountMinor: r.charged_amount_minor,
    status: r.estimate_status,
    estimateMinor: r.estimate_minor,
    feeStatus: r.estimate_fee_status,
    rate: r.estimate_rate,
    rateSource: r.estimate_rate_source,
    rateDate: r.estimate_rate_date,
    ruleSetVersion: r.rule_set_version,
    ruleId: r.rule_id,
    estimatedAt: r.estimated_at,
    actualMinor: r.actual_minor,
    actualEnteredAt: r.actual_entered_at,
  };
}

/** Whether a draft is paid/funded by a card and can therefore carry a card charge. */
function cardFunded(d: TransactionDraft): boolean {
  return (d.type === 'EXPENSE' && d.payment.method === 'CARD') || (d.type === 'ATM_WITHDRAWAL' && d.cardId !== null);
}

/**
 * Ledger Engine persistence: the single component that writes `transactions`, `ledger_entries`,
 * `card_charges` and `transaction_history` (enforced by a repository-wide test).
 */
export class SqliteLedgerRepository implements LedgerRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => string,
  ) {}

  record(draft: TransactionDraft, cardCharge: CardChargeEstimate | null = null): number {
    this.assertValid(draft, cardCharge);
    return inTransaction(this.db, () => {
      const t = this.now();
      const c = toColumns(draft);
      const cols = Object.keys(c) as (keyof Columns)[];
      const id = this.db.run(
        `INSERT INTO transactions (${cols.join(', ')}, revision, created_at, updated_at)
         VALUES (${cols.map(() => '?').join(', ')}, 1, ?, ?)`,
        [...cols.map((k) => c[k] as SqlValue), t, t],
      ).lastInsertRowId;
      this.writeEntries(id, 1, draft, t);
      if (cardCharge) this.upsertCardCharge(id, cardCharge, null);
      this.history(id, 1, 'CREATE', { after: this.snapshot(id) }, t);
      return id;
    });
  }

  revise(id: number, draft: TransactionDraft, cardCharge: CardChargeEstimate | null = null): void {
    this.assertValid(draft, cardCharge);
    inTransaction(this.db, () => {
      const current = this.activeRow(id);
      if (current.type !== draft.type || current.trip_id !== draft.tripId) {
        throw new Error('Transaction type and trip cannot change on edit');
      }
      const before = this.snapshot(id);
      const t = this.now();
      const revision = current.revision + 1;
      const c = toColumns(draft);
      const cols = (Object.keys(c) as (keyof Columns)[]).filter((k) => k !== 'trip_id' && k !== 'type');
      this.db.run(
        `UPDATE transactions SET ${cols.map((k) => `${k} = ?`).join(', ')}, revision = ?, updated_at = ? WHERE id = ?`,
        [...cols.map((k) => c[k] as SqlValue), revision, t, id],
      );
      this.writeEntries(id, revision, draft, t);
      const existing = this.cardChargeRow(id);
      this.db.run('DELETE FROM card_charges WHERE transaction_id = ?', [id]);
      if (cardCharge) this.upsertCardCharge(id, cardCharge, existing);
      this.history(id, revision, 'EDIT', { before, after: this.snapshot(id) }, t);
    });
  }

  softDelete(id: number): void {
    inTransaction(this.db, () => {
      const current = this.activeRow(id);
      const t = this.now();
      this.db.run('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, id]);
      this.history(id, current.revision, 'DELETE', { before: this.snapshot(id) }, t);
    });
  }

  setActualCharge(id: number, actualMinor: number | null): void {
    if (actualMinor !== null && (!Number.isSafeInteger(actualMinor) || actualMinor <= 0)) {
      throw new LedgerValidationError(['AMOUNT_NOT_POSITIVE']);
    }
    inTransaction(this.db, () => {
      const current = this.activeRow(id);
      const t = this.now();
      const changed = this.db.run(
        'UPDATE card_charges SET actual_minor = ?, actual_entered_at = ? WHERE transaction_id = ?',
        [actualMinor, actualMinor === null ? null : t, id],
      ).changes;
      if (changed !== 1) throw new Error('Transaction has no card charge');
      this.db.run('UPDATE transactions SET updated_at = ? WHERE id = ?', [t, id]);
      this.history(id, current.revision, 'ACTUAL_CHARGE', { actualMinor }, t);
    });
  }

  get(id: number): StoredTransaction | undefined {
    const r = this.db.get<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!r) return undefined;
    const cc = this.cardChargeRow(id);
    return {
      id: r.id,
      revision: r.revision,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      draft: rowToDraft(r),
      cardCharge: cc ? rowToCardCharge(cc) : null,
    };
  }

  balances(tripId: number): WalletBalance[] {
    return this.db
      .all<{ wallet_id: number; currency: string; opening: number; balance: number }>(
        `SELECT w.id AS wallet_id, w.currency AS currency,
                COALESCE((SELECT SUM(e.amount_minor) FROM ledger_entries e JOIN transactions t
                            ON t.id = e.transaction_id AND t.revision = e.revision AND t.deleted_at IS NULL
                           WHERE e.wallet_id = w.id AND t.type = 'OPENING_BALANCE'), 0) AS opening,
                COALESCE((SELECT SUM(e.amount_minor) FROM ledger_entries e JOIN transactions t
                            ON t.id = e.transaction_id AND t.revision = e.revision AND t.deleted_at IS NULL
                           WHERE e.wallet_id = w.id), 0) AS balance
           FROM cash_wallets w
          WHERE w.trip_id = ?
          ORDER BY w.id`,
        [tripId],
      )
      .map((r) => ({ walletId: r.wallet_id, currency: r.currency, openingMinor: r.opening, balanceMinor: r.balance }));
  }

  findInconsistencies(tripId: number): number[] {
    const rows = this.db.all<TransactionRow>(
      'SELECT * FROM transactions WHERE trip_id = ? AND deleted_at IS NULL ORDER BY id',
      [tripId],
    );
    const bad: number[] = [];
    for (const r of rows) {
      const actual = this.db
        .all<{ currency: string; amount_minor: number }>(
          `SELECT w.currency, e.amount_minor FROM ledger_entries e JOIN cash_wallets w ON w.id = e.wallet_id
            WHERE e.transaction_id = ? AND e.revision = ?`,
          [r.id, r.revision],
        )
        .map((e) => `${e.currency}:${e.amount_minor}`)
        .sort();
      const expected = cashEffects(rowToDraft(r))
        .map((e) => `${e.currency}:${e.amountMinor}`)
        .sort();
      if (actual.join('|') !== expected.join('|')) bad.push(r.id);
    }
    return bad;
  }

  private assertValid(draft: TransactionDraft, cardCharge: CardChargeEstimate | null): void {
    const violations = validateDraft(draft);
    if (violations.length > 0) throw new LedgerValidationError(violations);
    if (cardCharge && !cardFunded(draft)) throw new Error('Card charge given for a transaction not funded by card');
  }

  private activeRow(id: number): TransactionRow {
    const r = this.db.get<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!r) throw new Error(`Transaction ${id} not found`);
    if (r.deleted_at !== null) throw new Error(`Transaction ${id} is deleted`);
    return r;
  }

  private walletId(tripId: number, currency: string, t: string): number {
    const existing = this.db.get<{ id: number }>('SELECT id FROM cash_wallets WHERE trip_id = ? AND currency = ?', [
      tripId,
      currency,
    ]);
    if (existing) return existing.id;
    return this.db.run('INSERT INTO cash_wallets (trip_id, currency, created_at) VALUES (?, ?, ?)', [tripId, currency, t])
      .lastInsertRowId;
  }

  private writeEntries(id: number, revision: number, draft: TransactionDraft, t: string): void {
    for (const e of cashEffects(draft)) {
      this.db.run(
        'INSERT INTO ledger_entries (transaction_id, revision, wallet_id, amount_minor, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, revision, this.walletId(draft.tripId, e.currency, t), e.amountMinor, t],
      );
    }
  }

  private cardChargeRow(id: number): CardChargeRow | undefined {
    return this.db.get<CardChargeRow>('SELECT * FROM card_charges WHERE transaction_id = ?', [id]);
  }

  /** Writes the estimate; a previously entered actual charge is preserved across edits. */
  private upsertCardCharge(id: number, c: CardChargeEstimate, previous: CardChargeRow | null | undefined): void {
    this.db.run(
      `INSERT INTO card_charges (transaction_id, billing_currency, charged_currency, charged_amount_minor,
         estimate_status, estimate_minor, estimate_fee_status, estimate_rate, estimate_rate_source, estimate_rate_date,
         rule_set_version, rule_id, estimated_at, actual_minor, actual_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        c.billingCurrency,
        c.chargedCurrency,
        c.chargedAmountMinor,
        c.status,
        c.estimateMinor,
        c.feeStatus,
        c.rate,
        c.rateSource,
        c.rateDate,
        c.ruleSetVersion,
        c.ruleId,
        c.estimatedAt,
        previous?.actual_minor ?? null,
        previous?.actual_entered_at ?? null,
      ],
    );
  }

  private snapshot(id: number): unknown {
    return {
      transaction: this.db.get('SELECT * FROM transactions WHERE id = ?', [id]),
      cardCharge: this.cardChargeRow(id) ?? null,
    };
  }

  private history(id: number, revision: number, action: string, payload: unknown, t: string): void {
    this.db.run(
      'INSERT INTO transaction_history (transaction_id, revision, action, snapshot, changed_at) VALUES (?, ?, ?, ?, ?)',
      [id, revision, action, JSON.stringify(payload), t],
    );
  }
}
