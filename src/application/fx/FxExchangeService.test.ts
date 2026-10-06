import { exchangeRateView } from '../../domain/fx';
import { isExpense } from '../../domain/ledger';
import { money, toDecimalString } from '../../domain/money';
import { testServices } from '../../testing/services';

function setup() {
  const s = testServices();
  const tripId = s.tripService.createTrip(
    { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' },
    [money(150000, 'USD'), money(100000, 'THB')],
  );
  const bal = () => Object.fromEntries(s.ledger.balances(tripId).map((b) => [b.currency, b.balanceMinor]));
  return { ...s, tripId, bal };
}

describe('FX exchange engine', () => {
  it('changes both wallets atomically and is never an expense', () => {
    const { fxService, ledger, tripId, bal } = setup();
    const id = fxService.exchange({ tripId, given: money(100000, 'USD'), received: money(3200000, 'THB') });
    expect(bal()).toEqual({ USD: 50000, THB: 3300000 });
    expect(isExpense(ledger.get(id)!.draft)).toBe(false);
    expect(ledger.findInconsistencies(tripId)).toEqual([]);
  });

  it('creates the received wallet when it did not exist', () => {
    const { fxService, tripId, bal } = setup();
    fxService.exchange({ tripId, given: money(20000, 'USD'), received: money(2900000, 'JPY') });
    expect(bal()).toEqual({ USD: 130000, THB: 100000, JPY: 2900000 });
  });

  it('a failure of either leg leaves both wallets untouched', () => {
    const { fxService, db, tripId, bal } = setup();
    const realRun = db.run.bind(db);
    let n = 0;
    db.run = (sql, params) => {
      if (sql.startsWith('INSERT INTO ledger_entries') && ++n === 2) throw new Error('io');
      return realRun(sql, params);
    };
    expect(() => fxService.exchange({ tripId, given: money(100000, 'USD'), received: money(3200000, 'THB') })).toThrow('io');
    db.run = realRun;
    expect(bal()).toEqual({ USD: 150000, THB: 100000 });
  });

  it('rejects same-currency, zero and unsupported exchanges', () => {
    const { fxService, tripId } = setup();
    expect(() => fxService.exchange({ tripId, given: money(1, 'USD'), received: money(1, 'USD') })).toThrow();
    expect(() => fxService.exchange({ tripId, given: { minor: 0, currency: 'USD' }, received: money(1, 'THB') })).toThrow();
    expect(() => fxService.exchange({ tripId, given: money(1, 'USD'), received: { minor: 5, currency: 'ZZZ' } })).toThrow();
  });

  it('editing an exchange replaces both legs', () => {
    const { fxService, ledger, tripId, bal } = setup();
    const id = fxService.exchange({ tripId, given: money(100000, 'USD'), received: money(3200000, 'THB') });
    fxService.editExchange(id, { tripId, given: money(50000, 'USD'), received: money(1650000, 'THB'), occurrence: ledger.get(id)!.draft });
    expect(bal()).toEqual({ USD: 100000, THB: 1750000 });
    expect(() => fxService.editExchange(ledger.openingBalances(tripId)[0]!.id, { tripId, given: money(1, 'USD'), received: money(1, 'THB') })).toThrow();
  });
});

describe('effective rate (derived, exact)', () => {
  it('USD 1,000 → THB 32,000 reads 1 USD = 32 THB', () => {
    const v = exchangeRateView(money(100000, 'USD'), money(3200000, 'THB'));
    expect(v.display).toEqual({ from: 'USD', to: 'THB', rate: v.receivedPerGiven });
    expect(toDecimalString(v.receivedPerGiven)).toBe('32');
    expect(toDecimalString(v.givenPerReceived)).toBe('0.03125');
  });

  it('THB → USD displays the ≥1 direction (1 USD = x THB)', () => {
    const v = exchangeRateView(money(1000000, 'THB'), money(30000, 'USD'));
    expect(v.display.from).toBe('USD');
    expect(toDecimalString(v.display.rate)).toBe('33.33333333');
  });

  it('handles exponent differences (ILS → JPY, JOD → ILS)', () => {
    expect(toDecimalString(exchangeRateView(money(100000, 'ILS'), money(40500, 'JPY')).receivedPerGiven)).toBe('40.5');
    expect(toDecimalString(exchangeRateView(money(1000, 'JOD'), money(518, 'ILS')).receivedPerGiven)).toBe('5.18');
  });

  it('is precise for tiny/huge ratios', () => {
    const v = exchangeRateView(money(100, 'EUR'), money(2_850_000_00, 'IDR'));
    expect(toDecimalString(v.receivedPerGiven)).toBe('2850000');
    expect(toDecimalString(v.givenPerReceived)).toBe('0.00000035');
  });
});
