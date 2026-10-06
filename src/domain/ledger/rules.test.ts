import { money } from '../money';
import { cashEffects, isExpense, validateDraft } from './rules';
import type { TransactionDraft } from './types';

const occ = { tripId: 1, occurredAt: '2026-11-02T08:00:00.000Z', occurredLocalDate: '2026-11-02', tzOffsetMin: 420 };

describe('cash effects (FINANCIAL_DOMAIN examples)', () => {
  it('opening THB 7,000 → THB +7000', () => {
    expect(cashEffects({ ...occ, type: 'OPENING_BALANCE', amount: money(700000, 'THB') })).toEqual([
      { currency: 'THB', amountMinor: 700000 },
    ]);
  });
  it('cash expense THB 850 → THB −850', () => {
    const d: TransactionDraft = { ...occ, type: 'EXPENSE', amount: money(85000, 'THB'), categoryId: 1, payment: { method: 'CASH' } };
    expect(cashEffects(d)).toEqual([{ currency: 'THB', amountMinor: -85000 }]);
    expect(isExpense(d)).toBe(true);
  });
  it('credit expense THB 5,000 → no cash effect, still an expense', () => {
    const d: TransactionDraft = { ...occ, type: 'EXPENSE', amount: money(500000, 'THB'), categoryId: 1, payment: { method: 'CARD', cardId: 3 } };
    expect(cashEffects(d)).toEqual([]);
    expect(isExpense(d)).toBe(true);
  });
  it('USD 1,000 → THB 32,000 → USD −1000, THB +32000; not an expense', () => {
    const d: TransactionDraft = { ...occ, type: 'FX_EXCHANGE', given: money(100000, 'USD'), received: money(3200000, 'THB') };
    expect(cashEffects(d)).toEqual([
      { currency: 'USD', amountMinor: -100000 },
      { currency: 'THB', amountMinor: 3200000 },
    ]);
    expect(isExpense(d)).toBe(false);
  });
  it('ATM receive THB 40,000 (+fee 220) → THB +40000 only; not an expense', () => {
    const d: TransactionDraft = { ...occ, type: 'ATM_WITHDRAWAL', received: money(4000000, 'THB'), fee: money(22000, 'THB'), cardId: 1 };
    expect(cashEffects(d)).toEqual([{ currency: 'THB', amountMinor: 4000000 }]);
    expect(isExpense(d)).toBe(false);
  });
  it('reconciliation −THB 300 → THB −300', () => {
    expect(cashEffects({ ...occ, type: 'CASH_ADJUSTMENT', delta: money(-30000, 'THB') })).toEqual([
      { currency: 'THB', amountMinor: -30000 },
    ]);
  });
});

describe('validateDraft', () => {
  it('accepts valid drafts', () => {
    expect(validateDraft({ ...occ, type: 'CASH_ADJUSTMENT', delta: money(1, 'THB') })).toEqual([]);
  });
  it.each<[string, TransactionDraft, string]>([
    ['zero expense', { ...occ, type: 'EXPENSE', amount: { minor: 0, currency: 'THB' }, categoryId: 1, payment: { method: 'CASH' } }, 'AMOUNT_NOT_POSITIVE'],
    ['negative opening', { ...occ, type: 'OPENING_BALANCE', amount: { minor: -1, currency: 'THB' } }, 'AMOUNT_NOT_POSITIVE'],
    ['float amount', { ...occ, type: 'OPENING_BALANCE', amount: { minor: 1.5, currency: 'THB' } }, 'AMOUNT_NOT_POSITIVE'],
    ['unknown currency', { ...occ, type: 'OPENING_BALANCE', amount: { minor: 1, currency: 'XYZ' } }, 'UNSUPPORTED_CURRENCY'],
    ['fx same currency', { ...occ, type: 'FX_EXCHANGE', given: money(1, 'THB'), received: money(1, 'THB') }, 'FX_SAME_CURRENCY'],
    ['fee other currency', { ...occ, type: 'ATM_WITHDRAWAL', received: money(1, 'THB'), fee: money(1, 'USD'), cardId: null }, 'FEE_CURRENCY_MISMATCH'],
    ['zero adjustment', { ...occ, type: 'CASH_ADJUSTMENT', delta: { minor: 0, currency: 'THB' } }, 'AMOUNT_ZERO'],
    ['bad instant', { ...occ, occurredAt: '2026-11-02 08:00', type: 'CASH_ADJUSTMENT', delta: money(1, 'THB') }, 'INVALID_OCCURRENCE'],
    ['bad offset', { ...occ, tzOffsetMin: 900, type: 'CASH_ADJUSTMENT', delta: money(1, 'THB') }, 'INVALID_OCCURRENCE'],
    ['long note', { ...occ, note: 'x'.repeat(501), type: 'CASH_ADJUSTMENT', delta: money(1, 'THB') }, 'TEXT_TOO_LONG'],
    ['bad category', { ...occ, type: 'EXPENSE', amount: money(1, 'THB'), categoryId: 0, payment: { method: 'CASH' } }, 'INVALID_CATEGORY'],
  ])('rejects %s', (_name, draft, violation) => {
    expect(validateDraft(draft)).toContain(violation);
  });
});
