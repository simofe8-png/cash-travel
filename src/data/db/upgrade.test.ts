// Migration & data-integrity hardening (Step 28): representative upgrades of a populated v1 database.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IntegrityService } from '../../application/integrity/IntegrityService';
import { createServices } from '../../composition/createServices';
import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { FakeCamera, FakeDeviceAuth, FakePdfExporter, FakeReceiptStore } from '../../testing/FakeReceipts';
import { FakeClock } from '../../testing/fixtures';
import { NodeSqliteDatabase } from '../../testing/NodeSqliteDatabase';
import { SqliteIntegrityQueries } from '../SqliteIntegrityQueries';
import { SqliteLedgerRepository } from '../SqliteLedgerRepository';
import { backupDatabase, needsUpgrade } from './backup';
import { currentSchemaVersion, migrate, MigrationError, type Migration } from './migrate';
import { MIGRATIONS } from './migrations';

const clock = new FakeClock('2026-11-03T05:00:00.000Z', 420);
const platform = () => ({ fxProviders: [], receiptStore: new FakeReceiptStore(), receiptCamera: new FakeCamera(), deviceAuth: new FakeDeviceAuth(), pdfExporter: new FakePdfExporter() });

/** Future-style test migrations (never shipped): an added column and a SQLite table rebuild. */
const addColumn: Migration = { version: MIGRATIONS.length + 1, name: 'test_add_column', up: (db) => db.exec('ALTER TABLE trips ADD COLUMN cover_color TEXT') };
const rebuildCategories: Migration = {
  version: MIGRATIONS.length + 2,
  name: 'test_rebuild_categories',
  rebuildsTables: true,
  up: (db) =>
    db.exec(`
      CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY, builtin_key TEXT UNIQUE, name TEXT, icon TEXT NOT NULL, sort_order INTEGER NOT NULL,
        archived_at TEXT, created_at TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'teal'
      ) STRICT;
      INSERT INTO categories_new (id, builtin_key, name, icon, sort_order, archived_at, created_at)
        SELECT id, builtin_key, name, icon, sort_order, archived_at, created_at FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;`),
};
/** A rebuild that would orphan rows must be refused. */
const badRebuild: Migration = {
  version: MIGRATIONS.length + 1,
  name: 'test_bad_rebuild',
  rebuildsTables: true,
  up: (db) => db.exec('CREATE TABLE c2 (id INTEGER PRIMARY KEY, x TEXT) STRICT; DROP TABLE categories; ALTER TABLE c2 RENAME TO categories;'),
};
const failing: Migration = {
  version: MIGRATIONS.length + 1,
  name: 'test_failing',
  up: (db) => {
    db.exec('DELETE FROM receipts');
    db.exec('ALTER TABLE trips ADD COLUMN broken TEXT');
    throw new Error('disk I/O error');
  },
};

describe('migration & data integrity', () => {
  let dir: string;
  let path: string;
  let snapshot: () => unknown;

  /** A realistic v1 database: trips, every transaction type, edits, soft delete, card charge, receipt. */
  async function populateV1() {
    const db = new NodeSqliteDatabase(path);
    migrate(db, MIGRATIONS, clock.now);
    const s = createServices(db, clock, platform());
    const tripId = s.tripService.createTrip({ name: 'תאילנד', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB'), money(30000, 'USD')]);
    const custom = s.categoryService.createCustom('מתנות', 'gift');
    const at = (t: string) => occurrenceAtLocal('2026-11-02', t, 420);
    const e1 = s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: custom, payment: { method: 'CASH' }, description: 'שוק', occurrence: at('10:00') });
    const card = s.cardService.create({ issuer: 'MAX', classification: 'FEE_PERCENT:3', nickname: null, billingCurrency: 'ILS' });
    const e2 = s.expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: s.categories.getBuiltin('FOOD').id, payment: { method: 'CARD', cardId: card }, occurrence: at('11:00') });
    s.ledger.setActualCharge(e2, 47000);
    s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('12:00') });
    s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: card, occurrence: at('13:00') });
    s.reconciliationService.adjust({ tripId, delta: money(-5000, 'THB'), occurrence: at('14:00') });
    s.expenseService.editExpense(e1, { tripId, amount: money(90000, 'THB'), categoryId: custom, payment: { method: 'CASH' }, occurrence: at('10:00') });
    const gone = s.expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: custom, payment: { method: 'CASH' }, occurrence: at('15:00') });
    s.transactionService.delete(gone);
    await s.receiptService.attach(e1, 'file:///cache/r.jpg');
    s.fxRates.save([{ source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' }, { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' }], clock.now());
    return { db, s, tripId };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ct-upgrade-'));
    path = join(dir, 'cashtravel.db');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function financialState(db: NodeSqliteDatabase) {
    const t = (q: string) => db.all(q);
    return {
      trips: t('SELECT id, name, start_date, end_date, reporting_currency FROM trips ORDER BY id'),
      tx: t('SELECT * FROM transactions ORDER BY id'),
      entries: t('SELECT * FROM ledger_entries ORDER BY id'),
      cards: t('SELECT * FROM card_charges ORDER BY transaction_id'),
      history: t('SELECT * FROM transaction_history ORDER BY id'),
      receipts: t('SELECT * FROM receipts ORDER BY id'),
      categories: t('SELECT id, builtin_key, name, icon, sort_order, archived_at FROM categories ORDER BY id'),
      rates: t('SELECT * FROM fx_rates ORDER BY id'),
    };
  }

  it('a populated v1 database is internally consistent', async () => {
    const { db, s } = await populateV1();
    expect(s.integrityService.check()).toEqual({ ok: true, quickCheck: 'ok', foreignKeyViolations: 0, inconsistentTransactions: [], misplacedCardCharges: [], crossTripEntries: 0 });
    db.close();
  });

  it('representative upgrades (add column, table rebuild) keep every record and all invariants', async () => {
    const { db, tripId } = await populateV1();
    const before = financialState(db);
    const balancesBefore = new SqliteLedgerRepository(db, clock.now).balances(tripId);
    snapshot = () => before;
    db.close();

    const reopened = new NodeSqliteDatabase(path);
    expect(needsUpgrade(reopened, [...MIGRATIONS, addColumn, rebuildCategories])).toBe(true);
    const report = migrate(reopened, [...MIGRATIONS, addColumn, rebuildCategories], clock.now);
    expect(report.applied).toEqual([addColumn.version, rebuildCategories.version]);
    expect(financialState(reopened)).toEqual(snapshot());
    const ledger = new SqliteLedgerRepository(reopened, clock.now);
    expect(ledger.balances(tripId)).toEqual(balancesBefore);
    expect(new IntegrityService(new SqliteIntegrityQueries(reopened), ledger).check().ok).toBe(true);
    // The app keeps working on the upgraded schema.
    const s = createServices(reopened, clock, platform());
    s.expenseService.addExpense({ tripId, amount: money(100, 'THB'), categoryId: s.categories.getBuiltin('OTHER').id, payment: { method: 'CASH' } });
    expect(s.integrityService.check().ok).toBe(true);
    reopened.close();
  });

  it('a failing upgrade rolls back completely: schema version and every record unchanged', async () => {
    const { db } = await populateV1();
    const before = financialState(db);
    expect(() => migrate(db, [...MIGRATIONS, failing], clock.now)).toThrow(MigrationError);
    expect(currentSchemaVersion(db)).toBe(MIGRATIONS.length);
    expect(financialState(db)).toEqual(before);
    expect(db.all("SELECT name FROM pragma_table_info('trips') WHERE name = 'broken'")).toEqual([]);
    db.close();
  });

  it('a table rebuild that would orphan rows is refused and fully rolled back; FKs stay enforced', async () => {
    const { db } = await populateV1();
    const before = financialState(db);
    expect(() => migrate(db, [...MIGRATIONS, badRebuild], clock.now)).toThrow(/foreign key violations/);
    expect(financialState(db)).toEqual(before);
    expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it('pre-upgrade snapshot (VACUUM INTO) is a complete, openable copy', async () => {
    const { db } = await populateV1();
    const before = financialState(db);
    const backupPath = join(dir, 'cashtravel.pre-upgrade-v1.db');
    backupDatabase(db, backupPath);
    expect(existsSync(backupPath)).toBe(true);
    expect(() => backupDatabase(db, backupPath)).toThrow(); // never overwrites an existing snapshot
    db.close();
    const copy = new NodeSqliteDatabase(backupPath);
    expect(financialState(copy)).toEqual(before);
    expect(currentSchemaVersion(copy)).toBe(MIGRATIONS.length);
    copy.close();
  });

  it('a fresh database needs no upgrade snapshot', () => {
    const db = new NodeSqliteDatabase(path);
    expect(needsUpgrade(db, MIGRATIONS)).toBe(false);
    migrate(db, MIGRATIONS, clock.now);
    expect(needsUpgrade(db, MIGRATIONS)).toBe(false);
    db.close();
  });

  it('derived data is rebuildable: clearing the FX cache changes no financial record', async () => {
    const { db, s, tripId } = await populateV1();
    const before = financialState(db);
    db.exec('DELETE FROM fx_rates');
    const after = financialState(db);
    expect({ ...after, rates: [] }).toEqual({ ...before, rates: [] });
    expect(s.reportingService.spending(tripId).totalTripCost.unavailableCount).toBeGreaterThan(0); // honest until refetched
    s.fxRates.save([{ source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' }, { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' }], clock.now());
    expect(s.reportingService.spending(tripId).totalTripCost.unavailableCount).toBe(0);
    db.close();
  });

  it('integrity check detects tampering', async () => {
    const { db, s, tripId } = await populateV1();
    const someTx = s.journalService.list(tripId)[0]!.id;
    db.run("INSERT INTO ledger_entries (transaction_id, revision, wallet_id, amount_minor, created_at) VALUES (?, (SELECT revision FROM transactions WHERE id = ?), 1, 7, 'x')", [someTx, someTx]);
    const r = s.integrityService.check();
    expect(r.ok).toBe(false);
    expect(r.inconsistentTransactions).toContain(someTx);
    db.close();
  });
});
