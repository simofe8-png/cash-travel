import { money } from '../../domain/money';
import { BUNDLED_CARD_RULE_SET } from '../../data/cardRules/bundledRuleSet';
import { testServices } from '../../testing/services';
import { CardError } from './CardService';

function setup() {
  const s = testServices();
  s.clock.set('2026-10-05T10:00:00.000Z', 180);
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '3.431', rateDate: '2026-10-05' },
      { source: 'ECB', quote: 'THB', rate: '37.752', rateDate: '2026-10-05' },
    ],
    'test',
  );
  const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-10-01', endDate: '2026-10-20', reportingCurrency: 'ILS' }, [money(100000, 'THB')]);
  const food = s.categories.getBuiltin('FOOD').id;
  return { ...s, tripId, food };
}

describe('Card Cost Engine — integration', () => {
  it('bundled rule set is installed, versioned and has no invented fees', () => {
    const { cardRules } = setup();
    const r = cardRules.activeOn('2026-10-05')!;
    expect(r.version).toBe('2026.10.1');
    expect(Object.values(r.issuers).every((i) => i.defaultFeePercent === null)).toBe(true);
    expect(cardRules.activeOn('2026-09-01')).toBeNull(); // not effective yet
  });

  it('controlled update: a newer valid rule set wins; invalid documents are rejected', () => {
    const { cardCostService, cardRules } = setup();
    expect(cardCostService.installRuleSet({ version: 'broken' })).toBe(false);
    const next = { ...(BUNDLED_CARD_RULE_SET as object), version: '2026.10.2', source: 'update' };
    expect(cardCostService.installRuleSet(next)).toBe(true);
    expect(cardRules.activeOn('2026-10-05')!.version).toBe('2026.10.2');
  });

  it('card expense stores an offline estimate with provenance; cash unaffected', () => {
    const { expenseService, cardService, ledger, tripId, food } = setup();
    const card = cardService.create({ issuer: 'ISRACARD', classification: 'FEE_PERCENT:3', nickname: 'Gold', billingCurrency: 'ILS' });
    const id = expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: card } });
    expect(ledger.get(id)!.cardCharge).toMatchObject({
      status: 'ESTIMATED',
      estimateMinor: 46805,
      feeStatus: 'INCLUDED',
      rateSource: 'ECB',
      rateDate: '2026-10-05',
      ruleSetVersion: '2026.10.1',
      actualMinor: null,
    });
    expect(ledger.balances(tripId)[0]!.balanceMinor).toBe(100000);
  });

  it('missing rate → UNAVAILABLE estimate but the expense is still saved', () => {
    const { expenseService, ledger, tripId, food } = setup();
    const id = expenseService.addExpense({ tripId, amount: money(10000, 'VND'), categoryId: food, payment: { method: 'CARD', cardId: null } });
    expect(ledger.get(id)!.cardCharge).toMatchObject({ status: 'UNAVAILABLE', estimateMinor: null });
  });

  it('DCC: "charged in another currency" is preserved', () => {
    const { expenseService, ledger, tripId, food } = setup();
    const id = expenseService.addExpense({
      tripId,
      amount: money(500000, 'THB'),
      categoryId: food,
      payment: { method: 'CARD', cardId: null },
      chargedIn: { currency: 'ILS', amountMinor: 47900 },
    });
    expect(ledger.get(id)!.cardCharge).toMatchObject({ chargedCurrency: 'ILS', chargedAmountMinor: 47900, estimateMinor: 47900 });
  });

  it('actual charge overrides nothing in the estimate and both are kept', () => {
    const { expenseService, ledger, tripId, food } = setup();
    const id = expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: null } });
    ledger.setActualCharge(id, 46950);
    expect(ledger.get(id)!.cardCharge).toMatchObject({ estimateMinor: 45441, actualMinor: 46950 });
  });

  it('ATM withdrawal estimate covers principal + local fee, fees marked unknown', () => {
    const { atmService, ledger, tripId } = setup();
    // (40,000 + 220) THB × 3.431 / 37.752 = 3655.2977… ILS
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: null });
    expect(ledger.get(id)!.cardCharge).toMatchObject({ chargedAmountMinor: 4022000, estimateMinor: 365530, feeStatus: 'UNKNOWN', status: 'ESTIMATED' });
  });

  it('card management never accepts credential-like data', () => {
    const { cardService } = setup();
    expect(() => cardService.create({ issuer: 'MAX', classification: '4580123412341234', nickname: null, billingCurrency: 'ILS' })).toThrow(CardError);
    expect(() => cardService.create({ issuer: 'AMEX' as never, classification: 'UNKNOWN', nickname: null, billingCurrency: 'ILS' })).toThrow(CardError);
    expect(() => cardService.create({ issuer: 'MAX', classification: 'UNKNOWN', nickname: 'x'.repeat(31), billingCurrency: 'ILS' })).toThrow(CardError);
    const id = cardService.create({ issuer: 'CAL', classification: 'NO_FOREIGN_FEE', nickname: ' Travel ', billingCurrency: 'ILS' });
    expect(cardService.get(id)).toEqual({ id, issuer: 'CAL', classification: 'NO_FOREIGN_FEE', nickname: 'Travel', billingCurrency: 'ILS', archived: false });
  });
});
