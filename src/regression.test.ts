// Step 29 — regression matrix (supervisor protocol §14): one deterministic trip that walks every mandatory
// financial case, asserting exact ledger and reporting figures at each stage. Rates (EUR pivot):
// 1 EUR = 4 ILS = 40 THB = 1 USD → 1 THB = ₪0.10, 1 USD = ₪4, 1 EUR = ₪4.
import { money } from './domain/money';
import { occurrenceAtLocal } from './domain/time';
import { testServices } from './testing/services';

const at = (date: string, time = '12:00') => occurrenceAtLocal(date, time, 420);

describe('financial regression matrix', () => {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420); // Nov 3, 12:00 in Bangkok (trip day 3)
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'USD', rate: '1', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-10-20' },
      { source: 'ECB', quote: 'USD', rate: '1', rateDate: '2026-10-20' },
    ],
    'seed',
  );
  const food = s.categories.getBuiltin('FOOD').id;
  const other = s.categories.getBuiltin('OTHER').id;
  const card = s.cardService.create({ issuer: 'ISRACARD', classification: 'NO_FOREIGN_FEE', nickname: null, billingCurrency: 'ILS' });
  let tripId = 0;
  let cashFood = 0;

  const bal = (id = tripId) => Object.fromEntries(s.ledger.balances(id).map((b) => [b.currency, b.balanceMinor]));
  const spending = () => s.reportingService.spending(tripId);
  const txSnapshot = () => ({
    tx: s.db.all('SELECT * FROM transactions ORDER BY id'),
    entries: s.db.all('SELECT * FROM ledger_entries ORDER BY id'),
    charges: s.db.all('SELECT * FROM card_charges ORDER BY transaction_id'),
  });
  const consistent = () => {
    expect(s.ledger.findInconsistencies(tripId)).toEqual([]);
    expect(s.integrityService.check().ok).toBe(true);
  };

  it('opening THB/USD/EUR are historical ledger transactions', () => {
    tripId = s.tripService.createTrip({ name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB'), money(30000, 'USD'), money(10000, 'EUR')]);
    expect(bal()).toEqual({ THB: 700000, USD: 30000, EUR: 10000 });
    expect(spending().totalTripCost.count).toBe(0); // opening money is not spending (and not a budget)
    consistent();
  });

  it('cash expense reduces cash; credit expense counts as spending without touching cash', () => {
    cashFood = s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-02') });
    s.expenseService.addExpense({ tripId, amount: money(50000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card }, occurrence: at('2026-11-02') });
    expect(bal().THB).toBe(700000 - 85000);
    expect(spending().cash.amount).toEqual(money(8500, 'ILS'));
    expect(spending().card.amount).toEqual(money(5000, 'ILS')); // no-FX-fee card: reference estimate
    consistent();
  });

  it('USD→THB exchange moves cash between wallets and is not spending', () => {
    const before = spending().totalTripCost.amount;
    s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('2026-11-03', '09:00') });
    expect(bal()).toMatchObject({ USD: 20000, THB: 615000 + 320000 });
    expect(spending().totalTripCost.amount).toEqual(before);
    consistent();
  });

  it('card-funded THB ATM withdrawal adds the cash received; only the optional local fee is a trip cost', () => {
    s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: card, occurrence: at('2026-11-03', '10:00') });
    expect(bal().THB).toBe(935000 + 1000000);
    expect(spending().atmFees.amount).toEqual(money(2200, 'ILS'));
    expect(spending().totalTripCost.amount).toEqual(money(8500 + 5000 + 2200, 'ILS'));
    consistent();
  });

  it('cash adjustments (positive and negative) are explicit ledger events, never spending', () => {
    s.reconciliationService.adjust({ tripId, delta: money(10000, 'THB'), occurrence: at('2026-11-03', '11:00') });
    s.reconciliationService.adjust({ tripId, delta: money(-5000, 'THB'), occurrence: at('2026-11-03', '11:05') });
    expect(bal().THB).toBe(1935000 + 10000 - 5000);
    expect(spending().totalTripCost.amount).toEqual(money(15700, 'ILS'));
    consistent();
  });

  it('negative cash is allowed, flagged and never blocks the expense', () => {
    s.expenseService.addExpense({ tripId, amount: money(15000, 'EUR'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-03', '11:30') });
    expect(bal().EUR).toBe(-5000);
    expect(s.reportingService.wallets(tripId).find((w) => w.currency === 'EUR')).toMatchObject({ negative: true });
    consistent();
  });

  it('editing re-derives the ledger with no stale effects', () => {
    s.expenseService.editExpense(cashFood, { tripId, amount: money(90000, 'THB'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-02') });
    expect(bal().THB).toBe(1940000 - 5000);
    expect(spending().cash.amount).toEqual(money(9000 + 60000, 'ILS')); // 900 THB + 150 EUR
    consistent();
  });

  it('soft delete removes an action from balances, journal and reports at once', () => {
    const id = s.expenseService.addExpense({ tripId, amount: money(2000, 'USD'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-03', '11:40') });
    expect(bal().USD).toBe(18000);
    s.transactionService.delete(id);
    expect(bal().USD).toBe(20000);
    expect(s.journalService.list(tripId).some((r) => r.id === id)).toBe(false);
    expect(spending().totalTripCost.amount).toEqual(money(9000 + 60000 + 5000 + 2200, 'ILS'));
    consistent();
  });

  it('pre-trip expense is in total trip cost but not "during trip"', () => {
    s.expenseService.addExpense({ tripId, amount: money(200000, 'ILS'), categoryId: other, payment: { method: 'CARD', cardId: card }, occurrence: at('2026-10-20') });
    const r = spending();
    expect(r.preTrip.amount).toEqual(money(200000, 'ILS'));
    expect(r.duringTrip.amount).toEqual(money(76200, 'ILS'));
    expect(r.totalTripCost.amount).toEqual(money(276200, 'ILS'));
  });

  it('no cached rate offline: the action is saved in its original currency and reported as unavailable', () => {
    s.expenseService.addExpense({ tripId, amount: money(100000, 'VND'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('2026-11-03', '12:00') });
    expect(bal().VND).toBe(-100000);
    const t = spending().totalTripCost;
    expect(t.amount).toEqual(money(276200, 'ILS'));
    expect(t.unavailable).toEqual([money(100000, 'VND')]);
    consistent();
  });

  it('later rate enrichment fills reporting without mutating any original record', () => {
    const before = txSnapshot();
    s.fxRates.save([{ source: 'ECB', quote: 'VND', rate: '25000', rateDate: '2026-11-01' }], 'later');
    expect(txSnapshot()).toEqual(before);
    const t = spending().totalTripCost;
    expect(t.unavailableCount).toBe(0);
    expect(t.amount).toEqual(money(276200 + 1600, 'ILS')); // 100,000 VND × 4/25,000 = ₪16
  });

  it('custom category: create, use, delete → reassigned to Other via the ledger', () => {
    const gifts = s.categoryService.createCustom('מתנות', 'gift');
    const id = s.expenseService.addExpense({ tripId, amount: money(10000, 'THB'), categoryId: gifts, payment: { method: 'CASH' }, occurrence: at('2026-11-03', '12:30') });
    const thb = bal().THB;
    expect(spending().byCategory.some((c) => c.categoryId === gifts)).toBe(true);
    s.categoryService.deleteCustom(gifts);
    const tx = s.ledger.get(id)!;
    expect(tx.draft.type === 'EXPENSE' && tx.draft.categoryId).toBe(other);
    expect(bal().THB).toBe(thb);
    expect(spending().byCategory.some((c) => c.categoryId === gifts)).toBe(false);
    consistent();
  });

  it('reporting-currency change re-presents totals and never mutates originals', () => {
    const before = txSnapshot();
    const ils = spending().totalTripCost.amount; // ₪2,788 (incl. ₪10 gifts → Other)
    expect(ils).toEqual(money(278800, 'ILS'));
    s.tripService.updateTripDetails(tripId, { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'USD' });
    expect(txSnapshot()).toEqual(before);
    expect(spending().totalTripCost.amount).toEqual(money(69700, 'USD')); // 2,788 / 4
    s.tripService.updateTripDetails(tripId, { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' });
    expect(spending().totalTripCost.amount).toEqual(ils);
  });

  it('multiple trips stay isolated; switching the current trip changes only the selection', () => {
    const before = bal();
    const rome = s.tripService.createTrip({ name: 'Rome', startDate: '2027-01-01', endDate: '2027-01-05', reportingCurrency: 'EUR' }, [money(50000, 'EUR')]);
    s.tripService.selectTrip(rome);
    expect(s.tripService.currentTrip()?.id).toBe(rome);
    expect(bal(rome)).toEqual({ EUR: 50000 });
    expect(bal(tripId)).toEqual(before);
    s.tripService.selectTrip(tripId);
    expect(s.tripService.currentTrip()?.id).toBe(tripId);
    consistent();
  });
});
