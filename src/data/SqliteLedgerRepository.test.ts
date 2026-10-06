import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { cashEffects, LedgerValidationError, type CardChargeEstimate, type TransactionDraft } from '../domain/ledger';
import { money } from '../domain/money';
import { at, categoryId, insertCard, insertTrip, migratedDb, testClock } from '../testing/fixtures';
import { SqliteLedgerRepository } from './SqliteLedgerRepository';

function setup() {
  const db = migratedDb();
  insertTrip(db, 1);
  insertTrip(db, 2, '2026-12-01', '2026-12-10');
  const card = insertCard(db);
  const ledger = new SqliteLedgerRepository(db, testClock());
  return { db, ledger, card, food: categoryId(db, 'FOOD') };
}

const bal = (ledger: SqliteLedgerRepository, trip = 1) =>
  Object.fromEntries(ledger.balances(trip).map((b) => [b.currency, b.balanceMinor]));
const count = (db: SqlDatabase, table: string) => db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;

const opening = (minor: number, ccy: string, tripId = 1): TransactionDraft => ({
  ...at(),
  tripId,
  type: 'OPENING_BALANCE',
  amount: money(minor, ccy),
});

const estimate: CardChargeEstimate = {
  billingCurrency: 'ILS',
  chargedCurrency: 'THB',
  chargedAmountMinor: null,
  status: 'ESTIMATED',
  estimateMinor: 52000,
  feeStatus: 'UNKNOWN',
  rate: '0.104',
  rateSource: 'TEST',
  rateDate: '2026-11-02',
  ruleSetVersion: null,
  ruleId: null,
  estimatedAt: '2026-11-02T08:00:00.000Z',
};

describe('Ledger Engine — balances per transaction type', () => {
  it('derives the full worked example from the financial domain spec', () => {
    const { ledger, food, card } = setup();
    ledger.record(opening(700000, 'THB'));
    ledger.record(opening(150000, 'USD'));
    expect(bal(ledger)).toEqual({ THB: 700000, USD: 150000 });

    ledger.record({ ...at(), tripId: 1, type: 'EXPENSE', amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    expect(bal(ledger).THB).toBe(615000);

    ledger.record(
      { ...at(), tripId: 1, type: 'EXPENSE', amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } },
      estimate,
    );
    expect(bal(ledger).THB).toBe(615000); // credit expense never reduces physical cash

    ledger.record({ ...at(), tripId: 1, type: 'FX_EXCHANGE', given: money(100000, 'USD'), received: money(3200000, 'THB') });
    expect(bal(ledger)).toEqual({ THB: 3815000, USD: 50000 });

    ledger.record({ ...at(), tripId: 1, type: 'ATM_WITHDRAWAL', received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: card }, estimate);
    expect(bal(ledger)).toEqual({ THB: 7815000, USD: 50000 }); // only the received principal; fee is not cash

    ledger.record({ ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: money(-30000, 'THB') });
    expect(bal(ledger)).toEqual({ THB: 7785000, USD: 50000 });

    const thb = ledger.balances(1).find((b) => b.currency === 'THB')!;
    expect(thb.openingMinor).toBe(700000);
    expect(ledger.findInconsistencies(1)).toEqual([]);
  });

  it('allows negative cash (never blocks a cash expense)', () => {
    const { ledger, food } = setup();
    ledger.record(opening(10000, 'EUR'));
    ledger.record({ ...at(), tripId: 1, type: 'EXPENSE', amount: money(25000, 'EUR'), categoryId: food, payment: { method: 'CASH' } });
    expect(bal(ledger).EUR).toBe(-15000);
  });

  it('creates wallets on demand and isolates trips', () => {
    const { ledger, db } = setup();
    ledger.record({ ...at(), tripId: 1, type: 'FX_EXCHANGE', given: money(100000, 'ILS'), received: money(27000, 'USD') });
    ledger.record(opening(5000, 'USD', 2));
    expect(bal(ledger, 1)).toEqual({ ILS: -100000, USD: 27000 });
    expect(bal(ledger, 2)).toEqual({ USD: 5000 });
    expect(count(db, 'cash_wallets')).toBe(3);
  });
});

describe('Ledger Engine — atomicity (all or nothing)', () => {
  it('a failure after the parent and entries were written leaves zero financial effect', () => {
    const { ledger, db, food, card } = setup();
    ledger.record(opening(700000, 'THB'));
    const before = { tx: count(db, 'transactions'), le: count(db, 'ledger_entries'), h: count(db, 'transaction_history') };
    // Invalid card charge (ESTIMATED without amount) violates a CHECK *after* parent + entries are inserted.
    const broken = { ...estimate, estimateMinor: null };
    expect(() =>
      ledger.record(
        { ...at(), tripId: 1, type: 'EXPENSE', amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } },
        broken,
      ),
    ).toThrow();
    expect({ tx: count(db, 'transactions'), le: count(db, 'ledger_entries'), h: count(db, 'transaction_history') }).toEqual(before);
    expect(bal(ledger).THB).toBe(700000);
  });

  it('an FX exchange whose second leg fails writes neither leg', () => {
    const { ledger, db } = setup();
    // Intercept: fail on the second ledger insert.
    const realRun = db.run.bind(db);
    let entryInserts = 0;
    db.run = (sql, params) => {
      if (sql.startsWith('INSERT INTO ledger_entries') && ++entryInserts === 2) throw new Error('disk full');
      return realRun(sql, params);
    };
    expect(() =>
      ledger.record({ ...at(), tripId: 1, type: 'FX_EXCHANGE', given: money(100000, 'USD'), received: money(3200000, 'THB') }),
    ).toThrow('disk full');
    db.run = realRun;
    expect(count(db, 'transactions')).toBe(0);
    expect(count(db, 'ledger_entries')).toBe(0);
    expect(count(db, 'cash_wallets')).toBe(0);
    expect(bal(ledger)).toEqual({});
  });

  it('a failing history write rolls back the whole edit', () => {
    const { ledger, db, food } = setup();
    const id = ledger.record({ ...at(), tripId: 1, type: 'EXPENSE', amount: money(1000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    const realRun = db.run.bind(db);
    db.run = (sql, params) => {
      if (sql.startsWith('INSERT INTO transaction_history')) throw new Error('io');
      return realRun(sql, params);
    };
    expect(() =>
      ledger.revise(id, { ...at(), tripId: 1, type: 'EXPENSE', amount: money(9000, 'THB'), categoryId: food, payment: { method: 'CASH' } }),
    ).toThrow('io');
    db.run = realRun;
    expect(ledger.get(id)!.revision).toBe(1);
    expect(bal(ledger).THB).toBe(-1000);
    expect(count(db, 'ledger_entries')).toBe(1);
  });

  it('validation failures write nothing', () => {
    const { ledger, db } = setup();
    expect(() => ledger.record({ ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: { minor: 0, currency: 'THB' } })).toThrow(
      LedgerValidationError,
    );
    expect(() => ledger.record(opening(100, 'THB', 99))).toThrow(); // unknown trip (FK)
    expect(count(db, 'transactions')).toBe(0);
  });

  it('refuses a card charge on a cash transaction', () => {
    const { ledger, food } = setup();
    expect(() =>
      ledger.record({ ...at(), tripId: 1, type: 'EXPENSE', amount: money(1, 'THB'), categoryId: food, payment: { method: 'CASH' } }, estimate),
    ).toThrow(/not funded by card/);
  });
});

describe('Ledger Engine — edits, soft delete and history', () => {
  it('an edit replaces the active effects and keeps the old revision for audit', () => {
    const { ledger, db, food } = setup();
    ledger.record(opening(700000, 'THB'));
    const id = ledger.record({ ...at(), tripId: 1, type: 'EXPENSE', amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    ledger.revise(id, { ...at(), tripId: 1, type: 'EXPENSE', amount: money(90000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    expect(bal(ledger).THB).toBe(610000);
    expect(ledger.get(id)!.revision).toBe(2);
    expect(db.all('SELECT revision, amount_minor FROM ledger_entries WHERE transaction_id = ? ORDER BY revision', [id])).toEqual([
      { revision: 1, amount_minor: -85000 },
      { revision: 2, amount_minor: -90000 },
    ]);
    const hist = db.all<{ action: string; snapshot: string }>('SELECT action, snapshot FROM transaction_history WHERE transaction_id = ? ORDER BY id', [id]);
    expect(hist.map((h) => h.action)).toEqual(['CREATE', 'EDIT']);
    const edit = JSON.parse(hist[1]!.snapshot);
    expect(edit.before.transaction.amount_minor).toBe(85000);
    expect(edit.after.transaction.amount_minor).toBe(90000);
  });

  it('switching cash → card removes the cash effect; card → cash restores it', () => {
    const { ledger, food, card } = setup();
    ledger.record(opening(100000, 'THB'));
    const cash: TransactionDraft = { ...at(), tripId: 1, type: 'EXPENSE', amount: money(30000, 'THB'), categoryId: food, payment: { method: 'CASH' } };
    const id = ledger.record(cash);
    expect(bal(ledger).THB).toBe(70000);
    ledger.revise(id, { ...cash, payment: { method: 'CARD', cardId: card } }, estimate);
    expect(bal(ledger).THB).toBe(100000);
    expect(ledger.get(id)!.cardCharge?.estimateMinor).toBe(52000);
    ledger.revise(id, cash);
    expect(bal(ledger).THB).toBe(70000);
    expect(ledger.get(id)!.cardCharge).toBeNull();
    expect(ledger.findInconsistencies(1)).toEqual([]);
  });

  it('cannot change type or trip on edit, nor edit a deleted transaction', () => {
    const { ledger } = setup();
    const id = ledger.record(opening(100, 'THB'));
    expect(() => ledger.revise(id, { ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: money(100, 'THB') })).toThrow(/cannot change/);
    expect(() => ledger.revise(id, opening(100, 'THB', 2))).toThrow(/cannot change/);
    ledger.softDelete(id);
    expect(() => ledger.revise(id, opening(200, 'THB'))).toThrow(/deleted/);
    expect(() => ledger.softDelete(id)).toThrow(/deleted/);
  });

  it('soft delete immediately removes all financial effect but keeps the record', () => {
    const { ledger, db } = setup();
    ledger.record(opening(700000, 'THB'));
    const id = ledger.record({ ...at(), tripId: 1, type: 'FX_EXCHANGE', given: money(100000, 'THB'), received: money(2800, 'USD') });
    expect(bal(ledger)).toEqual({ THB: 600000, USD: 2800 });
    ledger.softDelete(id);
    expect(bal(ledger)).toEqual({ THB: 700000, USD: 0 });
    expect(ledger.get(id)!.deletedAt).not.toBeNull();
    expect(count(db, 'ledger_entries')).toBe(3);
    expect(db.get("SELECT action FROM transaction_history WHERE transaction_id = ? AND action = 'DELETE'", [id])).toBeDefined();
  });

  it('actual card charge is stored apart from the estimate and survives edits', () => {
    const { ledger, db, food, card } = setup();
    const d: TransactionDraft = { ...at(), tripId: 1, type: 'EXPENSE', amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } };
    const id = ledger.record(d, estimate);
    ledger.setActualCharge(id, 53210);
    let cc = ledger.get(id)!.cardCharge!;
    expect([cc.estimateMinor, cc.actualMinor]).toEqual([52000, 53210]);
    ledger.revise(id, { ...d, note: 'dinner' }, { ...estimate, estimateMinor: 52100 });
    cc = ledger.get(id)!.cardCharge!;
    expect([cc.estimateMinor, cc.actualMinor]).toEqual([52100, 53210]);
    ledger.setActualCharge(id, null);
    expect(ledger.get(id)!.cardCharge!.actualMinor).toBeNull();
    expect(() => ledger.setActualCharge(id, -5)).toThrow(LedgerValidationError);
    expect(bal(ledger)).toEqual({}); // no cash wallet was ever touched
    expect(db.all("SELECT action FROM transaction_history WHERE action = 'ACTUAL_CHARGE'")).toHaveLength(2);
  });

  it('round-trips every draft type through storage', () => {
    const { ledger, food, card } = setup();
    const drafts: TransactionDraft[] = [
      opening(700000, 'THB'),
      { ...at(), tripId: 1, type: 'EXPENSE', amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, description: 'Pad thai', place: 'Bangkok', note: null },
      { ...at(), tripId: 1, type: 'EXPENSE', amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: null } },
      { ...at(), tripId: 1, type: 'FX_EXCHANGE', given: money(100000, 'USD'), received: money(3200000, 'THB') },
      { ...at(), tripId: 1, type: 'ATM_WITHDRAWAL', received: money(4000000, 'THB'), fee: null, cardId: card },
      { ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: money(-30000, 'THB') },
    ];
    for (const d of drafts) {
      const id = ledger.record(d);
      expect(ledger.get(id)!.draft).toEqual({ description: null, place: null, note: null, ...d });
    }
  });
});

describe('Ledger Engine — integrity audit and balance equation', () => {
  it('detects tampered ledger entries', () => {
    const { ledger, db } = setup();
    const id = ledger.record(opening(1000, 'THB'));
    expect(ledger.findInconsistencies(1)).toEqual([]);
    db.run("INSERT INTO ledger_entries (transaction_id, revision, wallet_id, amount_minor, created_at) VALUES (?, 1, 1, 5, 'x')", [id]);
    expect(ledger.findInconsistencies(1)).toEqual([id]);
  });

  it('random operation sequences always satisfy balance = Σ active effects (model check)', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const currencies = ['THB', 'USD', 'ILS', 'JPY'];
    for (let run = 0; run < 5; run++) {
      const { ledger, food, card } = setup();
      const model = new Map<number, TransactionDraft>();
      const pickMoney = (signed = false) => {
        const c = currencies[rnd(currencies.length)]!;
        const v = 1 + rnd(1_000_000);
        return money(signed && rnd(2) ? -v : v, c);
      };
      const randomDraft = (): TransactionDraft => {
        switch (rnd(5)) {
          case 0:
            return { ...at(), tripId: 1, type: 'OPENING_BALANCE', amount: pickMoney() };
          case 1:
            return { ...at(), tripId: 1, type: 'EXPENSE', amount: pickMoney(), categoryId: food, payment: rnd(2) ? { method: 'CASH' } : { method: 'CARD', cardId: card } };
          case 2: {
            const g = pickMoney();
            const r = pickMoney();
            return r.currency === g.currency
              ? { ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: g }
              : { ...at(), tripId: 1, type: 'FX_EXCHANGE', given: g, received: r };
          }
          case 3: {
            const r = pickMoney();
            return { ...at(), tripId: 1, type: 'ATM_WITHDRAWAL', received: r, fee: rnd(2) ? money(rnd(500), r.currency) : null, cardId: null };
          }
          default:
            return { ...at(), tripId: 1, type: 'CASH_ADJUSTMENT', delta: pickMoney(true) };
        }
      };
      for (let step = 0; step < 60; step++) {
        const ids = [...model.keys()];
        const op = ids.length === 0 ? 0 : rnd(4);
        if (op <= 1) {
          const d = randomDraft();
          model.set(ledger.record(d), d);
        } else if (op === 2) {
          const id = ids[rnd(ids.length)]!;
          const old = model.get(id)!;
          let d = randomDraft();
          while (d.type !== old.type) d = randomDraft();
          ledger.revise(id, d);
          model.set(id, d);
        } else {
          const id = ids[rnd(ids.length)]!;
          ledger.softDelete(id);
          model.delete(id);
        }
        const expected: Record<string, number> = {};
        for (const d of model.values()) for (const e of cashEffects(d)) expected[e.currency] = (expected[e.currency] ?? 0) + e.amountMinor;
        const actual = Object.fromEntries(Object.entries(bal(ledger)).filter(([c, v]) => v !== 0 || expected[c] !== undefined));
        for (const c of Object.keys(expected)) expect(actual[c] ?? 0).toBe(expected[c]);
        for (const [c, v] of Object.entries(bal(ledger))) if (!(c in expected)) expect(v).toBe(0);
      }
      expect(ledger.findInconsistencies(1)).toEqual([]);
    }
  });
});
