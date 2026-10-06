import { isExpense } from '../../domain/ledger';
import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { CategoryError } from './CategoryService';
import { ExpenseError } from './ExpenseService';

function setup() {
  const s = testServices();
  const tripId = s.tripService.createTrip(
    { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' },
    [money(700000, 'THB')],
  );
  const food = s.categories.getBuiltin('FOOD').id;
  const card = s.cards.create({ issuer: 'MAX', classification: 'UNKNOWN', nickname: 'Max', billingCurrency: 'ILS' });
  const thb = () => s.ledger.balances(tripId).find((b) => b.currency === 'THB')!.balanceMinor;
  return { ...s, tripId, food, card, thb };
}

describe('Expense Engine — cash vs credit', () => {
  it('cash expense reduces the wallet and counts as an expense', () => {
    const { expenseService, ledger, tripId, food, thb } = setup();
    const id = expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    expect(thb()).toBe(615000);
    expect(isExpense(ledger.get(id)!.draft)).toBe(true);
  });

  it('credit expense does not change physical cash but counts as an expense', () => {
    const { expenseService, ledger, tripId, food, card, thb } = setup();
    const id = expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } });
    expect(thb()).toBe(700000);
    expect(isExpense(ledger.get(id)!.draft)).toBe(true);
  });

  it('a card expense with an unspecified card is allowed', () => {
    const { expenseService, tripId, food, thb } = setup();
    expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: null } });
    expect(thb()).toBe(700000);
  });

  it('a cash expense in a currency without a wallet creates a negative wallet (never blocked)', () => {
    const { expenseService, ledger, tripId, food } = setup();
    expenseService.addExpense({ tripId, amount: money(2000, 'EUR'), categoryId: food, payment: { method: 'CASH' } });
    expect(ledger.balances(tripId).find((b) => b.currency === 'EUR')!.balanceMinor).toBe(-2000);
  });

  it('stores optional description/place/note and defaults time to now', () => {
    const { expenseService, ledger, tripId, food, clock } = setup();
    clock.set('2026-11-03T05:30:00.000Z', 420);
    const id = expenseService.addExpense({ tripId, amount: money(1, 'THB'), categoryId: food, payment: { method: 'CASH' }, description: ' Pad thai ', place: 'Chiang Mai', note: 'spicy' });
    expect(ledger.get(id)!.draft).toMatchObject({
      occurredAt: '2026-11-03T05:30:00.000Z',
      occurredLocalDate: '2026-11-03',
      tzOffsetMin: 420,
      description: 'Pad thai',
      place: 'Chiang Mai',
      note: 'spicy',
    });
  });

  it('editing cash → card restores cash; amount edits are revisions', () => {
    const { expenseService, ledger, tripId, food, card, thb } = setup();
    const base = { tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' } as const };
    const id = expenseService.addExpense(base);
    expenseService.editExpense(id, { ...base, amount: money(90000, 'THB'), occurrence: ledger.get(id)!.draft });
    expect(thb()).toBe(610000);
    expenseService.editExpense(id, { ...base, payment: { method: 'CARD', cardId: card }, occurrence: ledger.get(id)!.draft });
    expect(thb()).toBe(700000);
    expect(ledger.get(id)!.revision).toBe(3);
  });

  it('rejects invalid references without writing', () => {
    const { expenseService, cards, tripId, food, card, db } = setup();
    const before = db.get('SELECT COUNT(*) AS n FROM transactions');
    expect(() => expenseService.addExpense({ tripId: 99, amount: money(1, 'THB'), categoryId: food, payment: { method: 'CASH' } })).toThrow(ExpenseError);
    expect(() => expenseService.addExpense({ tripId, amount: money(1, 'THB'), categoryId: 999, payment: { method: 'CASH' } })).toThrow(ExpenseError);
    expect(() => expenseService.addExpense({ tripId, amount: money(1, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: 999 } })).toThrow(ExpenseError);
    cards.archive(card);
    expect(() => expenseService.addExpense({ tripId, amount: money(1, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } })).toThrow(ExpenseError);
    expect(() => expenseService.addExpense({ tripId, amount: money(0, 'THB'), categoryId: food, payment: { method: 'CASH' } })).toThrow();
    expect(db.get('SELECT COUNT(*) AS n FROM transactions')).toEqual(before);
  });

  it('editExpense refuses non-expense transactions', () => {
    const { expenseService, ledger, tripId, food } = setup();
    const openingId = ledger.openingBalances(tripId)[0]!.id;
    expect(() => expenseService.editExpense(openingId, { tripId, amount: money(1, 'THB'), categoryId: food, payment: { method: 'CASH' } })).toThrow(
      ExpenseError,
    );
  });
});

describe('Expense Engine — fast-entry defaults', () => {
  it('first defaults: a non-reporting cash wallet currency and cash', () => {
    const { expenseService, tripId } = setup();
    expect(expenseService.defaults(tripId)).toEqual({ currency: 'THB', payment: { method: 'CASH' } });
  });

  it('remembers last currency, payment method and card per trip', () => {
    const { expenseService, tripService, tripId, food, card } = setup();
    expenseService.addExpense({ tripId, amount: money(100, 'USD'), categoryId: food, payment: { method: 'CARD', cardId: card } });
    expect(expenseService.defaults(tripId)).toEqual({ currency: 'USD', payment: { method: 'CARD', cardId: card } });
    const other = tripService.createTrip({ name: 'Rome', startDate: '2027-01-01', endDate: '2027-01-05', reportingCurrency: 'ILS' }, []);
    expect(expenseService.defaults(other)).toEqual({ currency: 'ILS', payment: { method: 'CASH' } });
  });

  it('forgets an archived card', () => {
    const { expenseService, cards, tripId, food, card } = setup();
    expenseService.addExpense({ tripId, amount: money(100, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } });
    cards.archive(card);
    expect(expenseService.defaults(tripId).payment).toEqual({ method: 'CARD', cardId: null });
  });
});

describe('Categories — custom categories and reassignment', () => {
  it('lists six built-ins, creates/renames custom ones with unique names', () => {
    const { categoryService } = setup();
    expect(categoryService.list().map((c) => c.builtinKey)).toEqual(['FOOD', 'ACCOMMODATION', 'TRANSPORT', 'ENTERTAINMENT', 'SHOPPING', 'OTHER']);
    const id = categoryService.createCustom('מתנות', 'gift');
    expect(categoryService.list().find((c) => c.id === id)).toMatchObject({ name: 'מתנות', icon: 'gift', builtinKey: null });
    expect(() => categoryService.createCustom(' מתנות ', 'gift')).toThrow(CategoryError);
    expect(() => categoryService.createCustom('', 'gift')).toThrow(CategoryError);
    expect(() => categoryService.createCustom('x', 'not-an-icon')).toThrow(CategoryError);
    categoryService.renameCustom(id, 'מזכרות', 'bag');
    expect(categoryService.get(id)?.name).toBe('מזכרות');
  });

  it('deleting a used custom category reassigns its expenses to Other through the ledger', () => {
    const { categoryService, expenseService, ledger, db, tripId, thb } = setup();
    const gifts = categoryService.createCustom('Gifts', 'gift');
    const a = expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: gifts, payment: { method: 'CASH' } });
    const b = expenseService.addExpense({ tripId, amount: money(2000, 'THB'), categoryId: gifts, payment: { method: 'CARD', cardId: null } });
    const deleted = expenseService.addExpense({ tripId, amount: money(5000, 'THB'), categoryId: gifts, payment: { method: 'CASH' } });
    ledger.softDelete(deleted);
    expect(categoryService.usageCount(gifts)).toBe(2);
    const cashBefore = thb();

    categoryService.deleteCustom(gifts);
    const other = categoryService.list().find((c) => c.builtinKey === 'OTHER')!.id;
    for (const id of [a, b]) {
      const t = ledger.get(id)!;
      expect(t.draft.type === 'EXPENSE' && t.draft.categoryId).toBe(other);
      expect(t.revision).toBe(2);
    }
    expect(thb()).toBe(cashBefore); // reassignment has no cash effect
    expect(categoryService.list().some((c) => c.id === gifts)).toBe(false);
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transaction_history WHERE action = 'EDIT'")!.n).toBe(2);
    expect(ledger.findInconsistencies(tripId)).toEqual([]);
  });

  it('can reassign to a chosen category; built-ins cannot be deleted; invalid targets rejected', () => {
    const { categoryService, expenseService, ledger, tripId, food } = setup();
    const gifts = categoryService.createCustom('Gifts', 'gift');
    const id = expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: gifts, payment: { method: 'CASH' } });
    expect(() => categoryService.deleteCustom(food)).toThrow(CategoryError);
    expect(() => categoryService.deleteCustom(gifts, gifts)).toThrow(CategoryError);
    categoryService.deleteCustom(gifts, food);
    const t = ledger.get(id)!.draft;
    expect(t.type === 'EXPENSE' && t.categoryId).toBe(food);
  });

  it('reassignment is atomic: a failure leaves all expenses and the category unchanged', () => {
    const { categoryService, expenseService, ledger, db, tripId } = setup();
    const gifts = categoryService.createCustom('Gifts', 'gift');
    const a = expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: gifts, payment: { method: 'CASH' } });
    const b = expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: gifts, payment: { method: 'CASH' } });
    const realRun = db.run.bind(db);
    let edits = 0;
    db.run = (sql, params) => {
      if (sql.startsWith('UPDATE transactions SET') && ++edits === 2) throw new Error('io');
      return realRun(sql, params);
    };
    expect(() => categoryService.deleteCustom(gifts)).toThrow('io');
    db.run = realRun;
    for (const id of [a, b]) expect(ledger.get(id)!.revision).toBe(1);
    expect(categoryService.get(gifts)?.archived).toBe(false);
  });

  it('archived category cannot be used for new expenses but stays on old soft-deleted ones', () => {
    const { categoryService, expenseService, tripId } = setup();
    const gifts = categoryService.createCustom('Gifts', 'gift');
    categoryService.deleteCustom(gifts);
    expect(() => expenseService.addExpense({ tripId, amount: money(1, 'THB'), categoryId: gifts, payment: { method: 'CASH' } })).toThrow(ExpenseError);
    expect(() => categoryService.createCustom('Gifts', 'gift')).not.toThrow(); // name reusable after delete
  });
});
