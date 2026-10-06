import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';

const at = (date: string, time = '12:00') => occurrenceAtLocal(date, time, 420);

function scenario() {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'USD', rate: '1', rateDate: '2026-11-01' },
    ],
    'seed',
  );
  const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, []);
  const cat = (k: string) => s.categories.getBuiltin(k).id;
  const e = (amount: number, k: string, date: string, time: string, payment: 'CASH' | 'CARD', extra = {}) =>
    s.expenseService.addExpense({ tripId, amount: money(amount, 'THB'), categoryId: cat(k), payment: payment === 'CASH' ? { method: 'CASH' } : { method: 'CARD', cardId: null }, occurrence: at(date, time), ...extra });
  const ids = {
    breakfast: e(10000, 'FOOD', '2026-11-02', '08:00', 'CASH', { description: 'Breakfast', place: 'Chiang Mai' }),
    taxi: e(20000, 'TRANSPORT', '2026-11-02', '19:00', 'CARD', { note: 'airport 100% fixed_price' }),
    dinner: e(30000, 'FOOD', '2026-11-03', '20:00', 'CARD', { description: 'Dinner' }),
    fx: s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('2026-11-03', '10:00') }),
    atm: s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: null, occurrence: at('2026-11-03', '11:00') }),
  };
  return { ...s, tripId, ids, cat };
}

describe('Journal', () => {
  it('lists newest first and groups by local day', () => {
    const { journalService, tripId, ids } = scenario();
    const days = journalService.days(tripId);
    expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-02']);
    expect(days[0]!.rows.map((r) => r.id)).toEqual([ids.dinner, ids.atm, ids.fx]);
    expect(days[1]!.rows.map((r) => r.id)).toEqual([ids.taxi, ids.breakfast]);
  });

  it('daily totals count EXPENSE only — FX/ATM principal and ATM fees excluded', () => {
    const { journalService, tripId } = scenario();
    const days = journalService.days(tripId);
    expect(days[0]!.expenseTotal!.amount).toEqual(money(3000, 'ILS')); // dinner 300 THB only
    expect(days[1]!.expenseTotal!.amount).toEqual(money(3000, 'ILS')); // 100 + 200 THB
  });

  it('days without expenses have no total', () => {
    const s = scenario();
    s.reconciliationService.adjust({ tripId: s.tripId, delta: money(500, 'THB'), occurrence: at('2026-11-05') });
    const d = s.journalService.days(s.tripId).find((x) => x.date === '2026-11-05')!;
    expect(d.expenseTotal).toBeNull();
  });

  it('day grouping uses the local date where it happened (late-night entry)', () => {
    const s = scenario();
    const id = s.expenseService.addExpense({ tripId: s.tripId, amount: money(100, 'THB'), categoryId: s.cat('FOOD'), payment: { method: 'CASH' }, occurrence: at('2026-11-04', '23:59') });
    const d = s.journalService.days(s.tripId).find((x) => x.rows.some((r) => r.id === id))!;
    expect(d.date).toBe('2026-11-04'); // UTC instant is 16:59 on Nov 4; device in Israel later doesn't regroup
  });

  it('searches description, place and note (case-insensitive, literal % and _)', () => {
    const { journalService, tripId, ids } = scenario();
    expect(journalService.list(tripId, { search: 'breakfast' }).map((r) => r.id)).toEqual([ids.breakfast]);
    expect(journalService.list(tripId, { search: 'chiang' }).map((r) => r.id)).toEqual([ids.breakfast]);
    expect(journalService.list(tripId, { search: '100%' }).map((r) => r.id)).toEqual([ids.taxi]);
    expect(journalService.list(tripId, { search: 'fixed_price' }).map((r) => r.id)).toEqual([ids.taxi]);
    expect(journalService.list(tripId, { search: '%' }).map((r) => r.id)).toEqual([ids.taxi]);
    expect(journalService.list(tripId, { search: 'nothing' })).toEqual([]);
  });

  it('filters by category, type and payment method (combinable)', () => {
    const { journalService, tripId, ids, cat } = scenario();
    expect(journalService.list(tripId, { categoryId: cat('FOOD') }).map((r) => r.id)).toEqual([ids.dinner, ids.breakfast]);
    expect(journalService.list(tripId, { type: 'FX_EXCHANGE' }).map((r) => r.id)).toEqual([ids.fx]);
    expect(journalService.list(tripId, { paymentMethod: 'CARD' }).map((r) => r.id)).toEqual([ids.dinner, ids.taxi]);
    expect(journalService.list(tripId, { paymentMethod: 'CARD', categoryId: cat('FOOD') }).map((r) => r.id)).toEqual([ids.dinner]);
  });

  it('deleted actions disappear from the journal', () => {
    const { journalService, ledger, tripId, ids } = scenario();
    ledger.softDelete(ids.dinner);
    expect(journalService.list(tripId).map((r) => r.id)).not.toContain(ids.dinner);
    expect(journalService.days(tripId)[0]!.expenseTotal).toBeNull();
  });
});
