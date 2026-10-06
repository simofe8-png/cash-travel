import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { isExpense } from '../../domain/ledger';
import { money } from '../../domain/money';
import { testServices } from '../../testing/services';

function setup() {
  const s = testServices();
  const tripId = s.tripService.createTrip(
    { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' },
    [money(700000, 'THB')],
  );
  const food = s.categories.getBuiltin('FOOD').id;
  const thb = () => s.ledger.balances(tripId).find((b) => b.currency === 'THB')?.balanceMinor;
  return { ...s, tripId, food, thb };
}

describe('Cash adjustment & reconciliation', () => {
  it('records a signed adjustment as an auditable ledger event, not an expense', () => {
    const { reconciliationService, ledger, db, tripId, thb } = setup();
    const id = reconciliationService.adjust({ tripId, delta: money(-30000, 'THB'), note: 'lost a note' });
    expect(thb()).toBe(670000);
    expect(isExpense(ledger.get(id)!.draft)).toBe(false);
    expect(db.get('SELECT action FROM transaction_history WHERE transaction_id = ?', [id])).toEqual({ action: 'CREATE' });
    reconciliationService.adjust({ tripId, delta: money(5000, 'THB') });
    expect(thb()).toBe(675000);
  });

  it('reconcile from a counted amount derives the delta through the ledger', () => {
    const { reconciliationService, ledger, tripId, thb } = setup();
    expect(reconciliationService.difference(tripId, money(650000, 'THB'))).toEqual(money(-50000, 'THB'));
    const id = reconciliationService.reconcile({ tripId, counted: money(650000, 'THB') })!;
    expect(thb()).toBe(650000);
    const d = ledger.get(id)!.draft;
    expect(d.type === 'CASH_ADJUSTMENT' && d.delta).toEqual(money(-50000, 'THB'));
    expect(reconciliationService.reconcile({ tripId, counted: money(650000, 'THB') })).toBeNull(); // already matches
    expect(ledger.findInconsistencies(tripId)).toEqual([]);
  });

  it('reconciles a negative wallet back to the counted cash', () => {
    const { reconciliationService, expenseService, tripId, food, thb } = setup();
    expenseService.addExpense({ tripId, amount: money(900000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    expect(thb()).toBe(-200000); // negative allowed and visible
    reconciliationService.reconcile({ tripId, counted: money(0, 'THB'), note: 'forgot an ATM withdrawal' });
    expect(thb()).toBe(0);
  });

  it('reconciles a currency with no wallet yet (found cash)', () => {
    const { reconciliationService, ledger, tripId } = setup();
    reconciliationService.reconcile({ tripId, counted: money(2000, 'EUR') });
    expect(ledger.balances(tripId).find((b) => b.currency === 'EUR')?.balanceMinor).toBe(2000);
  });

  it('rejects zero/negative counts and zero adjustments', () => {
    const { reconciliationService, tripId } = setup();
    expect(() => reconciliationService.reconcile({ tripId, counted: money(-1, 'THB') })).toThrow();
    expect(() => reconciliationService.adjust({ tripId, delta: money(0, 'THB') })).toThrow();
  });

  it('an adjustment can be edited or soft-deleted, restoring the derived balance', () => {
    const { reconciliationService, ledger, tripId, thb } = setup();
    const id = reconciliationService.adjust({ tripId, delta: money(-30000, 'THB') });
    reconciliationService.editAdjustment(id, { tripId, delta: money(-10000, 'THB'), occurrence: ledger.get(id)!.draft });
    expect(thb()).toBe(690000);
    ledger.softDelete(id);
    expect(thb()).toBe(700000);
  });

  it('no API anywhere sets a balance directly', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((n) => {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) files.push(p);
      });
    walk(join(__dirname, '..', '..'));
    const offenders = files.filter((f) => /\b(setBalance|updateBalance|overrideBalance|editBalance)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
