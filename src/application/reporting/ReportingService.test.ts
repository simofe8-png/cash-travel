import { money, normalize, toDecimalString } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';

const at = (date: string) => occurrenceAtLocal(date, '12:00', 420);

/** EUR pivot with round numbers: 1 THB = 0.10 ILS, 1 USD = 4 ILS. */
function seedRates(s: ReturnType<typeof testServices>) {
  const r = (quote: string, rate: string, rateDate: string) => ({ source: 'ECB', quote, rate, rateDate });
  s.fxRates.save([r('ILS', '4', '2026-11-01'), r('THB', '40', '2026-11-01'), r('USD', '1', '2026-11-01'), r('ILS', '4', '2026-11-10'), r('THB', '40', '2026-11-10')], 'seed');
}

function scenario() {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420); // 12:00 local on Nov 3 (trip day 3)
  seedRates(s);
  const tripId = s.tripService.createTrip(
    { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' },
    [money(1000000, 'THB')],
  );
  const cat = (k: string) => s.categories.getBuiltin(k).id;
  const ex = s.expenseService;
  // Pre-trip prepaid hotel, card billed in ILS.
  ex.addExpense({ tripId, amount: money(200000, 'ILS'), categoryId: cat('ACCOMMODATION'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-10-20') });
  // During trip
  ex.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, occurrence: at('2026-11-01') });
  const cardFood = ex.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-11-02') });
  s.ledger.setActualCharge(cardFood, 52000); // actual ₪520 beats the ₪500 estimate
  ex.addExpense({ tripId, amount: money(30000, 'THB'), categoryId: cat('TRANSPORT'), payment: { method: 'CASH' }, occurrence: at('2026-11-03') });
  s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('2026-11-03') });
  s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: null, occurrence: at('2026-11-03') });
  s.reconciliationService.adjust({ tripId, delta: money(-10000, 'THB'), occurrence: at('2026-11-03') });
  ex.addExpense({ tripId, amount: money(1000000, 'VND'), categoryId: cat('SHOPPING'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-11-03') }); // no VND rate
  const deleted = ex.addExpense({ tripId, amount: money(99900, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, occurrence: at('2026-11-03') });
  s.ledger.softDelete(deleted);
  // Post-trip
  ex.addExpense({ tripId, amount: money(10000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, occurrence: at('2026-11-12') });
  return { ...s, tripId, cat };
}

const ils = (minor: number) => money(minor, 'ILS');

describe('Reporting Engine', () => {
  it('total trip cost vs during/pre/post-trip, today and average per day', () => {
    const { reportingService, tripId } = scenario();
    const r = reportingService.spending(tripId);
    expect(r.totalTripCost.amount).toEqual(ils(266700)); // 2000 + 85 + 520 + 30 + 22 + 10
    expect(r.totalTripCost.unavailableCount).toBe(1);
    expect(r.totalTripCost.unavailable).toEqual([money(1000000, 'VND')]);
    expect(r.preTrip.amount).toEqual(ils(200000));
    expect(r.duringTrip.amount).toEqual(ils(65700)); // 85 + 520 + 30 + 22
    expect(r.postTrip.amount).toEqual(ils(1000));
    expect(r.today.amount).toEqual(ils(5200)); // 30 + 22 (+ VND unavailable)
    expect(r.today.unavailableCount).toBe(1);
    // 657 / 3 elapsed days; prepaid hotel does not extend the day count
    expect(r.averagePerDay).toEqual({ amount: ils(21900), days: 3, partial: true });
  });

  it('FX principal, ATM principal, opening balances and adjustments are never spending', () => {
    const { reportingService, tripId } = scenario();
    const r = reportingService.spending(tripId);
    const counted = r.totalTripCost.count + r.totalTripCost.unavailableCount;
    expect(counted).toBe(7); // 6 expense rows + 1 ATM fee row; FX/ATM principal, opening, adjustment and the deleted expense excluded
    expect(r.atmFees.amount).toEqual(ils(2200));
  });

  it('category totals hide zero-spend categories and keep unavailable ones visible', () => {
    const { reportingService, tripId, cat } = scenario();
    const r = reportingService.spending(tripId);
    const byId = Object.fromEntries(r.byCategory.map((c) => [c.categoryId, c.total]));
    expect(byId[cat('ACCOMMODATION')]!.amount).toEqual(ils(200000));
    expect(byId[cat('FOOD')]!.amount).toEqual(ils(61500)); // 85 + 520 + 10 (deleted excluded)
    expect(byId[cat('TRANSPORT')]!.amount).toEqual(ils(3000));
    expect(byId[cat('SHOPPING')]!.unavailableCount).toBe(1);
    expect(byId[cat('ENTERTAINMENT')]).toBeUndefined();
    expect(byId[cat('OTHER')]).toBeUndefined();
    expect(r.byCategory[0]!.categoryId).toBe(cat('ACCOMMODATION')); // largest first
  });

  it('cash vs credit', () => {
    const { reportingService, tripId } = scenario();
    const r = reportingService.spending(tripId);
    expect(r.cash.amount).toEqual(ils(12500)); // 85 + 30 + 10
    expect(r.card.amount).toEqual(ils(252000)); // 2000 + 520 (actual) ; VND unavailable
    expect(r.card.unavailableCount).toBe(1);
  });

  it('card value prefers actual, then estimate; values are labeled', () => {
    const { reportingService, expenseService, ledger, tripId, cat } = scenario();
    const id = expenseService.addExpense({ tripId, amount: money(100000, 'THB'), categoryId: cat('OTHER'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-11-04') });
    expect(ledger.get(id)!.cardCharge!.estimateMinor).toBe(10000); // 1,000 THB → ₪100 estimate (fees unknown)
    let other = reportingService.spending(tripId).byCategory.find((c) => c.categoryId === cat('OTHER'))!.total;
    expect([other.amount, other.estimatedCount]).toEqual([ils(10000), 1]);
    ledger.setActualCharge(id, 10350);
    other = reportingService.spending(tripId).byCategory.find((c) => c.categoryId === cat('OTHER'))!.total;
    expect([other.amount, other.estimatedCount]).toEqual([ils(10350), 0]);
  });

  it('derives a card estimate later when rates arrive after an offline save (without mutating the record)', () => {
    const s = testServices();
    s.clock.set('2026-11-03T05:00:00.000Z', 420);
    const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, []);
    const id = s.expenseService.addExpense({ tripId, amount: money(100000, 'THB'), categoryId: s.categories.getBuiltin('FOOD').id, payment: { method: 'CARD', cardId: null } });
    expect(s.ledger.get(id)!.cardCharge!.status).toBe('UNAVAILABLE');
    expect(s.reportingService.spending(tripId).totalTripCost.unavailableCount).toBe(1);
    const before = s.db.all('SELECT * FROM card_charges');
    seedRates(s);
    expect(s.reportingService.spending(tripId).totalTripCost.amount).toEqual(ils(10000));
    expect(s.db.all('SELECT * FROM card_charges')).toEqual(before);
  });

  it('reporting-currency change re-presents figures and never mutates financial records', () => {
    const s = scenario();
    const snapshot = () => ({
      tx: s.db.all('SELECT * FROM transactions ORDER BY id'),
      le: s.db.all('SELECT * FROM ledger_entries ORDER BY id'),
      cc: s.db.all('SELECT * FROM card_charges ORDER BY transaction_id'),
    });
    const before = snapshot();
    const trip = s.tripService.getTrip(s.tripId)!;
    s.tripService.updateTripDetails(s.tripId, { ...trip, reportingCurrency: 'USD' });
    const r = s.reportingService.spending(s.tripId);
    expect(r.reportingCurrency).toBe('USD');
    expect(r.duringTrip.amount).toEqual(money(16425, 'USD')); // 657 ILS / 4
    expect(snapshot()).toEqual(before);
  });

  it('wallets: opening and current derived from the ledger; negatives flagged; reporting equivalent', () => {
    const { reportingService, tripId } = scenario();
    const w = Object.fromEntries(reportingService.wallets(tripId).map((x) => [x.currency, x]));
    // 10,000 − 850 − 300 + 3,200 + 10,000 − 100 − 100 (post-trip) = 21,850 THB
    expect(w.THB).toMatchObject({ opening: money(1000000, 'THB'), current: money(2185000, 'THB'), negative: false, currentInReporting: ils(218500) });
    expect(w.USD).toMatchObject({ opening: money(0, 'USD'), current: money(-10000, 'USD'), negative: true, currentInReporting: ils(-40000) });
  });

  it('approximate equivalent of opening cash (trip setup)', () => {
    const { reportingService } = scenario();
    const t = reportingService.approximateEquivalent([money(1000000, 'THB'), money(5000, 'USD'), money(100, 'VND')], 'ILS', '2026-11-03');
    expect(t.amount).toEqual(ils(120000)); // 1,000 + 200
    expect(t.unavailable).toEqual([money(100, 'VND')]);
  });

  it('single-amount equivalent exposes the exact reference rate used; unavailable stays null', () => {
    const s = scenario();
    const e = s.reportingService.equivalent(money(85000, 'THB'), 'ILS', '2026-11-03')!;
    expect(e.amount).toEqual(money(8500, 'ILS'));
    expect(e.rate.from).toBe('THB');
    expect(e.rate.to).toBe('ILS');
    expect(toDecimalString(normalize(e.rate.rate))).toBe('0.1');
    expect(e).toMatchObject({ rateDate: '2026-11-01', source: 'ECB' });
    expect(s.reportingService.equivalent(money(100, 'VND'), 'ILS', '2026-11-03')).toBeNull();
  });

  it('before the trip starts there is no average per day; no budget fields exist', () => {
    const s = testServices();
    s.clock.set('2026-10-20T05:00:00.000Z', 420);
    const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(100000, 'ILS')]);
    const r = s.reportingService.spending(tripId);
    expect(r.averagePerDay).toBeNull();
    expect(JSON.stringify(Object.keys(r))).not.toMatch(/budget|remaining|left/i);
  });

  it('rate needs cover every date/currency in use', () => {
    const { reportingService, tripId } = scenario();
    const needs = reportingService.rateNeeds(tripId);
    const flat = needs.flatMap((n) => n.currencies.map((c) => `${n.date}:${c}`));
    expect(flat).toEqual(expect.arrayContaining(['2026-11-03:VND', '2026-11-03:USD', '2026-11-12:THB', '2026-11-02:ILS']));
  });
});
