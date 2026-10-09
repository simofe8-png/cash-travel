import { NodeSqliteDatabase } from '../../testing/NodeSqliteDatabase';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';

const T = '2026-10-06T10:00:00.000Z';

function fresh() {
  const db = new NodeSqliteDatabase();
  migrate(db, MIGRATIONS, () => T);
  return db;
}

function seedTrip(db: NodeSqliteDatabase) {
  db.run(
    `INSERT INTO trips (id, name, start_date, end_date, created_at, updated_at) VALUES (1, 'Thailand', '2026-11-01', '2026-11-20', ?, ?)`,
    [T, T],
  );
  db.run(`INSERT INTO cash_wallets (id, trip_id, currency, created_at) VALUES (1, 1, 'THB', ?)`, [T]);
}

const foodId = (db: NodeSqliteDatabase) =>
  db.get<{ id: number }>("SELECT id FROM categories WHERE builtin_key = 'FOOD'")!.id;

function insertTx(db: NodeSqliteDatabase, fields: Record<string, string | number | null>) {
  const base: Record<string, string | number | null> = {
    trip_id: 1,
    occurred_at: T,
    occurred_local_date: '2026-11-02',
    tz_offset_min: 420,
    currency: 'THB',
    created_at: T,
    updated_at: T,
    ...fields,
  };
  const cols = Object.keys(base);
  return db.run(
    `INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map((c) => base[c] ?? null),
  );
}

describe('core schema (migration 0001)', () => {
  it('creates all tables as STRICT with FKs and expected indexes', () => {
    const db = fresh();
    const tables = db
      .all<{ name: string; strict: number }>("SELECT name, strict FROM pragma_table_list WHERE schema='main' AND name NOT LIKE 'sqlite_%'")
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(tables.map((t) => t.name)).toEqual([
      'app_settings',
      'card_charges',
      'card_rule_sets',
      'cards',
      'cash_wallets',
      'categories',
      'fx_rates',
      'ledger_entries',
      'receipts',
      'schema_migrations',
      'transaction_history',
      'transactions',
      'trip_documents',
      'trip_purges',
      'trips',
    ]);
    expect(tables.every((t) => t.strict === 1)).toBe(true);
    const indexes = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'i%'").map((r) => r.name);
    expect(indexes).toEqual(
      expect.arrayContaining(['ix_tx_trip_active_time', 'ix_tx_trip_type_date', 'ix_le_wallet', 'ix_le_tx_rev', 'ix_fx_lookup', 'ix_documents_trip']),
    );
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('seeds the six built-in categories', () => {
    const db = fresh();
    expect(db.all('SELECT builtin_key FROM categories ORDER BY sort_order').map((r: any) => r.builtin_key)).toEqual([
      'FOOD',
      'ACCOMMODATION',
      'TRANSPORT',
      'ENTERTAINMENT',
      'SHOPPING',
      'OTHER',
    ]);
  });

  it('validates trips (dates, order, name)', () => {
    const db = fresh();
    const ins = (name: string, s: string, e: string) =>
      db.run('INSERT INTO trips (name, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [name, s, e, T, T]);
    expect(() => ins('ok', '2026-11-01', '2026-11-01')).not.toThrow();
    expect(() => ins('bad order', '2026-11-05', '2026-11-01')).toThrow(/CHECK/);
    expect(() => ins('bad date', '2026-02-30', '2026-03-01')).toThrow(/CHECK/);
    expect(() => ins('   ', '2026-11-01', '2026-11-02')).toThrow(/CHECK/);
  });

  it('enforces one cash wallet per trip and currency', () => {
    const db = fresh();
    seedTrip(db);
    expect(() => db.run(`INSERT INTO cash_wallets (trip_id, currency, created_at) VALUES (1, 'THB', ?)`, [T])).toThrow(/UNIQUE/);
  });

  it('enforces per-type transaction shape', () => {
    const db = fresh();
    seedTrip(db);
    const food = foodId(db);
    // Valid shapes
    expect(() => insertTx(db, { type: 'EXPENSE', amount_minor: 85000, category_id: food, payment_method: 'CASH' })).not.toThrow();
    expect(() => insertTx(db, { type: 'OPENING_BALANCE', amount_minor: 700000 })).not.toThrow();
    expect(() =>
      insertTx(db, { type: 'FX_EXCHANGE', amount_minor: 100000, currency: 'USD', counter_amount_minor: 3200000, counter_currency: 'THB' }),
    ).not.toThrow();
    expect(() => insertTx(db, { type: 'ATM_WITHDRAWAL', amount_minor: 4000000, fee_minor: 22000 })).not.toThrow();
    expect(() => insertTx(db, { type: 'CASH_ADJUSTMENT', amount_minor: -30000 })).not.toThrow();

    // Invalid shapes
    const bad: Record<string, string | number | null>[] = [
      { type: 'INCOME', amount_minor: 1 },
      { type: 'REFUND', amount_minor: 1 },
      { type: 'EXPENSE', amount_minor: 0, category_id: food, payment_method: 'CASH' },
      { type: 'EXPENSE', amount_minor: -5, category_id: food, payment_method: 'CASH' },
      { type: 'EXPENSE', amount_minor: 5, payment_method: 'CASH' },
      { type: 'EXPENSE', amount_minor: 5, category_id: food },
      { type: 'EXPENSE', amount_minor: 5, category_id: food, payment_method: 'CHEQUE' },
      { type: 'OPENING_BALANCE', amount_minor: -1 },
      { type: 'OPENING_BALANCE', amount_minor: 5, category_id: food },
      { type: 'FX_EXCHANGE', amount_minor: 100, counter_amount_minor: 100, counter_currency: 'THB' },
      { type: 'FX_EXCHANGE', amount_minor: 100, currency: 'USD' },
      { type: 'ATM_WITHDRAWAL', amount_minor: 100, fee_minor: -1 },
      { type: 'ATM_WITHDRAWAL', amount_minor: 0 },
      { type: 'CASH_ADJUSTMENT', amount_minor: 0 },
      { type: 'EXPENSE', amount_minor: 5, category_id: food, payment_method: 'CASH', occurred_local_date: '2026-13-01' },
      { type: 'EXPENSE', amount_minor: 5, category_id: food, payment_method: 'CASH', tz_offset_min: 2000 },
    ];
    for (const b of bad) expect(() => insertTx(db, b)).toThrow();
  });

  it('ledger entries: FK, non-zero, same-trip wallet, immutable', () => {
    const db = fresh();
    seedTrip(db);
    db.run(`INSERT INTO trips (id, name, start_date, end_date, created_at, updated_at) VALUES (2, 'Other', '2026-12-01', '2026-12-05', ?, ?)`, [T, T]);
    db.run(`INSERT INTO cash_wallets (id, trip_id, currency, created_at) VALUES (2, 2, 'THB', ?)`, [T]);
    const txId = insertTx(db, { type: 'OPENING_BALANCE', amount_minor: 700000 }).lastInsertRowId;
    const le = (wallet: number, amount: number, tx = txId) =>
      db.run('INSERT INTO ledger_entries (transaction_id, revision, wallet_id, amount_minor, created_at) VALUES (?, 1, ?, ?, ?)', [tx, wallet, amount, T]);

    expect(() => le(1, 700000)).not.toThrow();
    expect(() => le(1, 0)).toThrow(/CHECK/);
    expect(() => le(99, 5)).toThrow();
    expect(() => le(1, 5, 999)).toThrow(); // trigger or FK rejects an orphan entry
    expect(() => le(2, 5)).toThrow(/another trip/);
    expect(() => db.run('UPDATE ledger_entries SET amount_minor = 1')).toThrow(/immutable/);
    expect(() => db.run('DELETE FROM ledger_entries')).toThrow(/immutable/);
  });

  it('transactions are soft-delete only and keep type/trip immutable', () => {
    const db = fresh();
    seedTrip(db);
    const id = insertTx(db, { type: 'CASH_ADJUSTMENT', amount_minor: 100 }).lastInsertRowId;
    expect(() => db.run('DELETE FROM transactions WHERE id = ?', [id])).toThrow(/soft-deleted/);
    expect(() => db.run("UPDATE transactions SET type = 'EXPENSE' WHERE id = ?", [id])).toThrow(/immutable/);
    expect(() => db.run('UPDATE transactions SET deleted_at = ? WHERE id = ?', [T, id])).not.toThrow();
  });

  it('card charges keep estimate and actual separately with consistent status', () => {
    const db = fresh();
    seedTrip(db);
    db.run("INSERT INTO cards (id, issuer, created_at) VALUES (1, 'ISRACARD', ?)", [T]);
    const id = insertTx(db, { type: 'EXPENSE', amount_minor: 500000, category_id: foodId(db), payment_method: 'CARD', card_id: 1 }).lastInsertRowId;
    const ins = (status: string, est: number | null, actual: number | null, actualAt: string | null) =>
      db.run(
        `INSERT OR REPLACE INTO card_charges (transaction_id, billing_currency, charged_currency, estimate_status, estimate_minor, estimate_fee_status, actual_minor, actual_entered_at)
         VALUES (?, 'ILS', 'THB', ?, ?, 'UNKNOWN', ?, ?)`,
        [id, status, est, actual, actualAt],
      );
    expect(() => ins('ESTIMATED', 52000, null, null)).not.toThrow();
    expect(() => ins('ESTIMATED', 52000, 53210, T)).not.toThrow();
    expect(() => ins('UNAVAILABLE', null, null, null)).not.toThrow();
    expect(() => ins('ESTIMATED', null, null, null)).toThrow(/CHECK/);
    expect(() => ins('UNAVAILABLE', 1, null, null)).toThrow(/CHECK/);
    expect(() => ins('ESTIMATED', 1, 5, null)).toThrow(/CHECK/);
  });

  it('cards cannot hold credential-like fields', () => {
    const db = fresh();
    const cols = db.all<{ name: string }>("SELECT name FROM pragma_table_info('cards')").map((c) => c.name);
    expect(cols).toEqual(['id', 'issuer', 'classification', 'nickname', 'billing_currency', 'archived_at', 'created_at']);
    expect(() => db.run("INSERT INTO cards (issuer, created_at) VALUES ('AMEX', ?)", [T])).toThrow(/CHECK/);
  });

  it('fx_rates cache is unique per source/pair/date and requires positive rates', () => {
    const db = fresh();
    const ins = (rate: string, date = '2026-11-02') =>
      db.run("INSERT INTO fx_rates (source, base, quote, rate, rate_date, fetched_at) VALUES ('ECB', 'EUR', 'THB', ?, ?, ?)", [rate, date, T]);
    expect(() => ins('38.123')).not.toThrow();
    expect(() => ins('38.5')).toThrow(/UNIQUE/);
    expect(() => ins('0', '2026-11-03')).toThrow(/CHECK/);
  });

  it('receipts: one per transaction and file names are confined to the private dir', () => {
    const db = fresh();
    seedTrip(db);
    const id = insertTx(db, { type: 'CASH_ADJUSTMENT', amount_minor: 100 }).lastInsertRowId;
    const ins = (name: string) => db.run('INSERT INTO receipts (transaction_id, file_name, created_at) VALUES (?, ?, ?)', [id, name, T]);
    expect(() => ins('../../etc/x.jpg')).toThrow(/CHECK/);
    expect(() => ins('a/b.jpg')).toThrow(/CHECK/);
    expect(() => ins('r-1.jpg')).not.toThrow();
    expect(() => ins('r-2.jpg')).toThrow(/UNIQUE/);
  });

  it('custom category names are unique among active custom categories; built-ins cannot be archived', () => {
    const db = fresh();
    const ins = (name: string, archived: string | null = null) =>
      db.run("INSERT INTO categories (name, icon, sort_order, archived_at, created_at) VALUES (?, 'tag', 50, ?, ?)", [name, archived, T]);
    ins('Gifts');
    expect(() => ins('Gifts')).toThrow(/UNIQUE/);
    expect(() => ins('Gifts', T)).not.toThrow();
    expect(() => db.run("UPDATE categories SET archived_at = ? WHERE builtin_key = 'FOOD'", [T])).toThrow(/CHECK/);
  });
});
