import { atmCardDebit, atmFeeCost } from '../../domain/atm';
import { isExpense } from '../../domain/ledger';
import { money } from '../../domain/money';
import { testServices } from '../../testing/services';

function setup() {
  const s = testServices();
  const tripId = s.tripService.createTrip(
    { name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' },
    [money(150000, 'USD'), money(100000, 'THB'), money(50000, 'ILS')],
  );
  const card = s.cards.create({ issuer: 'ISRACARD', classification: 'UNKNOWN', nickname: null, billingCurrency: 'ILS' });
  const bal = () => Object.fromEntries(s.ledger.balances(tripId).map((b) => [b.currency, b.balanceMinor]));
  return { ...s, tripId, card, bal };
}

describe('ATM withdrawal engine', () => {
  it('received principal increases only that cash wallet and is not an expense', () => {
    const { atmService, ledger, tripId, card, bal } = setup();
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: card });
    expect(bal()).toEqual({ USD: 150000, THB: 4100000, ILS: 50000 }); // no unrelated wallet decremented
    expect(isExpense(ledger.get(id)!.draft)).toBe(false);
    expect(ledger.findInconsistencies(tripId)).toEqual([]);
  });

  it('the local fee never touches cash; the card debit is principal + fee in the cash currency', () => {
    const { atmService, ledger, tripId, card } = setup();
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: card });
    const t = ledger.get(id)!;
    expect(t.cardCharge).toMatchObject({
      chargedCurrency: 'THB',
      chargedAmountMinor: 4022000,
      billingCurrency: 'ILS',
      status: 'UNAVAILABLE',
      estimateMinor: null,
      actualMinor: null,
    });
    if (t.draft.type !== 'ATM_WITHDRAWAL') throw new Error();
    expect(atmFeeCost(t.draft)).toEqual(money(22000, 'THB'));
    expect(atmCardDebit(t.draft)).toEqual(money(4022000, 'THB'));
  });

  it('fee is optional; zero fee is stored as no fee', () => {
    const { atmService, ledger, tripId } = setup();
    const a = atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: null, cardId: null });
    const b = atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(0, 'THB'), cardId: null });
    for (const id of [a, b]) {
      const t = ledger.get(id)!;
      if (t.draft.type !== 'ATM_WITHDRAWAL') throw new Error();
      expect(t.draft.fee).toBeNull();
      expect(atmFeeCost(t.draft)).toBeNull();
      expect(t.cardCharge?.chargedAmountMinor).toBe(1000000);
    }
  });

  it('estimate and actual charge are separate; actual can be entered later without affecting cash', () => {
    const { atmService, ledger, tripId, card, bal } = setup();
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: card });
    const before = bal();
    ledger.setActualCharge(id, 438950); // ₪4,389.50 on the statement
    expect(ledger.get(id)!.cardCharge).toMatchObject({ estimateMinor: null, actualMinor: 438950 });
    expect(bal()).toEqual(before);
  });

  it('editing keeps the actual charge and recomputes the card debit', () => {
    const { atmService, ledger, tripId, card, bal } = setup();
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: null, cardId: card });
    ledger.setActualCharge(id, 438950);
    atmService.editWithdrawal(id, { tripId, received: money(3000000, 'THB'), fee: money(22000, 'THB'), cardId: card, occurrence: ledger.get(id)!.draft });
    expect(bal().THB).toBe(3100000);
    expect(ledger.get(id)!.cardCharge).toMatchObject({ chargedAmountMinor: 3022000, actualMinor: 438950 });
  });

  it('rejects fee in another currency, non-positive principal, unknown card', () => {
    const { atmService, tripId } = setup();
    expect(() => atmService.withdraw({ tripId, received: money(100, 'THB'), fee: money(5, 'USD'), cardId: null })).toThrow();
    expect(() => atmService.withdraw({ tripId, received: { minor: 0, currency: 'THB' }, fee: null, cardId: null })).toThrow();
    expect(() => atmService.withdraw({ tripId, received: money(100, 'THB'), fee: null, cardId: 999 })).toThrow('CARD_INVALID');
  });

  it('soft-deleting a withdrawal removes the cash it added', () => {
    const { atmService, ledger, tripId, bal } = setup();
    const id = atmService.withdraw({ tripId, received: money(4000000, 'THB'), fee: null, cardId: null });
    ledger.softDelete(id);
    expect(bal().THB).toBe(100000);
  });
});
