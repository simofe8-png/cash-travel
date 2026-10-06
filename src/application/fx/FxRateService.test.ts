import type { ReferenceRate } from '../../domain/fx';
import { money } from '../../domain/money';
import { SqliteFxRateRepository } from '../../data/SqliteFxRateRepository';
import { testServices } from '../../testing/services';
import type { FxRateProvider } from '../ports/FxRateProvider';
import { FxRateService } from './FxRateService';

class StubProvider implements FxRateProvider {
  calls: [string, string, string[]][] = [];
  constructor(
    readonly source: string,
    private readonly data: ReferenceRate[] | Error,
  ) {}
  async fetchRates(from: string, to: string, currencies: readonly string[]) {
    this.calls.push([from, to, [...currencies]]);
    if (this.data instanceof Error) throw this.data;
    return this.data.filter((r) => r.rateDate >= from && r.rateDate <= to && currencies.includes(r.quote));
  }
}

const ECB: ReferenceRate[] = [
  { source: 'ECB', quote: 'ILS', rate: '3.4408', rateDate: '2026-10-02' },
  { source: 'ECB', quote: 'THB', rate: '37.71', rateDate: '2026-10-02' },
  { source: 'ECB', quote: 'ILS', rate: '3.431', rateDate: '2026-10-05' },
  { source: 'ECB', quote: 'THB', rate: '37.752', rateDate: '2026-10-05' },
];
const SEC: ReferenceRate[] = [
  { source: 'CURRENCY_API', quote: 'VND', rate: '29261.61768248', rateDate: '2026-10-04' },
  { source: 'CURRENCY_API', quote: 'ILS', rate: '3.43520952', rateDate: '2026-10-04' },
];

function setup(primary: ReferenceRate[] | Error = ECB, secondary: ReferenceRate[] | Error = SEC) {
  const s = testServices();
  s.clock.set('2026-10-05T12:00:00.000Z', 180);
  const p1 = new StubProvider('ECB', primary);
  const p2 = new StubProvider('CURRENCY_API', secondary);
  const fx = new FxRateService(new SqliteFxRateRepository(s.db), [p1, p2], s.clock);
  return { ...s, fx, p1, p2 };
}

describe('FxRateService', () => {
  it('is offline-first: no cached rate → UNAVAILABLE, no network call', () => {
    const { fx, p1 } = setup();
    expect(fx.convert(money(8500000, 'THB'), 'ILS', '2026-10-05')).toEqual({ status: 'UNAVAILABLE' });
    expect(fx.convert(money(100, 'ILS'), 'ILS', '2026-10-05')).toMatchObject({ status: 'OK', amount: money(100, 'ILS') });
    expect(p1.calls).toEqual([]);
  });

  it('refresh fills the cache with one ranged primary request covering the rate window', async () => {
    const { fx, p1, p2 } = setup();
    const r = await fx.refresh([{ date: '2026-10-04', currencies: ['THB'] }, { date: '2026-10-05', currencies: ['THB'] }], 'ILS');
    expect(r.errors).toEqual([]);
    expect(p1.calls).toEqual([['2026-09-27', '2026-10-05', ['THB', 'ILS']]]);
    expect(p2.calls).toEqual([]);
    expect(fx.convert(money(8500000, 'THB'), 'ILS', '2026-10-05')).toMatchObject({ status: 'OK', amount: money(772502, 'ILS') });
    expect(fx.quote('THB', 'ILS', '2026-10-04')).toMatchObject({ rateDate: '2026-10-02', source: 'ECB' });
  });

  it('uses the secondary source only for what the primary could not provide', async () => {
    const { fx, p2 } = setup();
    await fx.refresh([{ date: '2026-10-04', currencies: ['VND', 'THB'] }], 'ILS');
    expect(p2.calls).toEqual([['2026-10-04', '2026-10-04', ['VND', 'ILS']]]);
    expect(fx.quote('VND', 'ILS', '2026-10-04')).toMatchObject({ source: 'CURRENCY_API' });
    expect(fx.quote('THB', 'ILS', '2026-10-04')).toMatchObject({ source: 'ECB' });
  });

  it('a provider failure never throws and leaves existing cache intact', async () => {
    const ok = setup();
    await ok.fx.refresh([{ date: '2026-10-05', currencies: ['THB'] }], 'ILS');
    const failing = new FxRateService(new SqliteFxRateRepository(ok.db), [new StubProvider('ECB', new Error('offline'))], ok.clock);
    const r = await failing.refresh([{ date: '2026-10-03', currencies: ['USD'] }], 'ILS');
    expect(r.errors).toEqual(['ECB: offline']);
    expect(failing.quote('THB', 'ILS', '2026-10-05')).not.toBeNull();
  });

  it('skips future dates and already satisfied needs', async () => {
    const { fx, p1 } = setup();
    await fx.refresh([{ date: '2026-10-05', currencies: ['THB'] }], 'ILS');
    await fx.refresh([{ date: '2026-10-05', currencies: ['THB'] }, { date: '2026-12-01', currencies: ['THB'] }], 'ILS');
    expect(p1.calls).toHaveLength(1);
  });

  it('published rates are immutable in the cache (re-fetch never overwrites)', async () => {
    const { fx, db } = setup();
    const repo = new SqliteFxRateRepository(db);
    repo.save([{ source: 'ECB', quote: 'THB', rate: '37.752', rateDate: '2026-10-05' }], 'a');
    expect(repo.save([{ source: 'ECB', quote: 'THB', rate: '99', rateDate: '2026-10-05' }], 'b')).toBe(0);
    expect(repo.find(['THB'], '2026-10-05', '2026-10-05')[0]!.rate).toBe('37.752');
    expect(fx).toBeDefined();
  });

  it('no rate never blocks an original-currency transaction, and refresh never mutates it', async () => {
    const { fx, expenseService, tripService, categories, db } = setup();
    const tripId = tripService.createTrip({ name: 'T', startDate: '2026-10-01', endDate: '2026-10-10', reportingCurrency: 'ILS' }, [money(100000, 'THB')]);
    const id = expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: categories.getBuiltin('FOOD').id, payment: { method: 'CASH' } });
    expect(fx.convert(money(85000, 'THB'), 'ILS', '2026-10-05').status).toBe('UNAVAILABLE');
    const before = db.all('SELECT * FROM transactions ORDER BY id');
    const entries = db.all('SELECT * FROM ledger_entries ORDER BY id');
    await fx.refresh([{ date: '2026-10-05', currencies: ['THB'] }], 'ILS');
    expect(fx.convert(money(85000, 'THB'), 'ILS', '2026-10-05').status).toBe('OK');
    expect(db.all('SELECT * FROM transactions ORDER BY id')).toEqual(before);
    expect(db.all('SELECT * FROM ledger_entries ORDER BY id')).toEqual(entries);
    expect(id).toBeGreaterThan(0);
  });
});
