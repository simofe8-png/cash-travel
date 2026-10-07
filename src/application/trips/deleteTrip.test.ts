// Whole-trip deletion (ADR-0012): everything that belongs to the trip goes, nothing else changes.
import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';

const at = (date: string) => occurrenceAtLocal(date, '12:00', 420);

async function scenario() {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  const food = s.categories.getBuiltin('FOOD').id;
  const card = s.cardService.create({ issuer: 'MAX', classification: 'FEE_PERCENT:3', nickname: null, billingCurrency: 'ILS' });
  const fill = async (name: string) => {
    const tripId = s.tripService.createTrip({ name, startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(500000, 'THB'), money(20000, 'USD')]);
    const e = s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-02') });
    const c = s.expenseService.addExpense({ tripId, amount: money(50000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card }, occurrence: at('2026-11-02') });
    s.ledger.setActualCharge(c, 5300);
    s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('2026-11-03') });
    s.atmService.withdraw({ tripId, received: money(100000, 'THB'), fee: money(2200, 'THB'), cardId: card, occurrence: at('2026-11-03') });
    s.expenseService.editExpense(e, { tripId, amount: money(90000, 'THB'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-02') });
    s.transactionService.delete(s.expenseService.addExpense({ tripId, amount: money(100, 'THB'), categoryId: food, payment: { method: 'CASH' } }));
    await s.receiptService.attach(e, `file:///cache/${name}.jpg`);
    return tripId;
  };
  const keep = await fill('Keep');
  const gone = await fill('Gone');
  return { s, keep, gone };
}

const rowsOf = (s: ReturnType<typeof testServices>, tripId: number) => ({
  tx: s.db.all('SELECT * FROM transactions WHERE trip_id = ? ORDER BY id', [tripId]),
  entries: s.db.all('SELECT e.* FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id WHERE t.trip_id = ? ORDER BY e.id', [tripId]),
  charges: s.db.all('SELECT c.* FROM card_charges c JOIN transactions t ON t.id = c.transaction_id WHERE t.trip_id = ?', [tripId]),
  history: s.db.all('SELECT h.* FROM transaction_history h JOIN transactions t ON t.id = h.transaction_id WHERE t.trip_id = ? ORDER BY h.id', [tripId]),
  receipts: s.db.all('SELECT r.* FROM receipts r JOIN transactions t ON t.id = r.transaction_id WHERE t.trip_id = ?', [tripId]),
  wallets: s.db.all('SELECT * FROM cash_wallets WHERE trip_id = ? ORDER BY id', [tripId]),
});

describe('delete trip', () => {
  it('removes every row and receipt photo of the trip; the other trip is byte-identical', async () => {
    const { s, keep, gone } = await scenario();
    const before = rowsOf(s, keep);
    const balancesBefore = s.ledger.balances(keep);
    expect(rowsOf(s, gone).receipts).toHaveLength(1);
    const goneFile = (rowsOf(s, gone).receipts[0] as { file_name: string }).file_name;

    s.tripService.deleteTrip(gone);

    expect(s.tripService.getTrip(gone)).toBeUndefined();
    expect(rowsOf(s, gone)).toEqual({ tx: [], entries: [], charges: [], history: [], receipts: [], wallets: [] });
    expect(s.receiptStore.files.has(goneFile)).toBe(false);
    expect(rowsOf(s, keep)).toEqual(before);
    expect(s.ledger.balances(keep)).toEqual(balancesBefore);
    expect(s.receiptStore.files.size).toBe(1);
    expect(s.db.all('SELECT * FROM trip_purges')).toEqual([]);
    expect(s.integrityService.check().ok).toBe(true);
  });

  it('switches to another existing trip, or to none', async () => {
    const { s, keep, gone } = await scenario();
    s.tripService.selectTrip(gone);
    expect(s.tripService.deleteTrip(gone)).toBe(keep);
    expect(s.tripService.currentTrip()?.id).toBe(keep);
    expect(s.tripService.deleteTrip(keep)).toBeNull();
    expect(s.tripService.currentTrip()).toBeUndefined();
    expect(s.db.all('SELECT * FROM transactions')).toEqual([]);
  });

  it('deleting a non-current trip keeps the current selection', async () => {
    const { s, keep, gone } = await scenario();
    s.tripService.selectTrip(keep);
    expect(s.tripService.deleteTrip(gone)).toBe(keep);
    expect(s.tripService.currentTrip()?.id).toBe(keep);
  });

  it('individual transactions and ledger entries stay protected outside a trip purge', async () => {
    const { s, keep } = await scenario();
    const tx = (s.db.get('SELECT id FROM transactions WHERE trip_id = ?', [keep]) as { id: number }).id;
    expect(() => s.db.run('DELETE FROM ledger_entries WHERE transaction_id = ?', [tx])).toThrow(/immutable/);
    expect(() => s.db.run('DELETE FROM transactions WHERE id = ?', [tx])).toThrow(/soft-deleted only/);
  });

  it('a failure inside the purge rolls everything back', async () => {
    const { s, gone } = await scenario();
    const before = rowsOf(s, gone);
    const original = s.ledger.purgeTrip.bind(s.ledger);
    s.ledger.purgeTrip = (id: number) => {
      original(id);
      throw new Error('disk I/O error');
    };
    expect(() => s.tripService.deleteTrip(gone)).toThrow('disk I/O error');
    expect(rowsOf(s, gone)).toEqual(before);
    expect(s.tripService.getTrip(gone)).toBeDefined();
    expect(s.receiptStore.files.size).toBe(2);
  });
});
