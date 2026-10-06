import { isSupportedCurrency, type Money } from '../money';
import type { CashEffect, TransactionDraft } from './types';

export type LedgerViolation =
  | 'AMOUNT_NOT_POSITIVE'
  | 'AMOUNT_ZERO'
  | 'UNSUPPORTED_CURRENCY'
  | 'FX_SAME_CURRENCY'
  | 'FEE_CURRENCY_MISMATCH'
  | 'FEE_NEGATIVE'
  | 'INVALID_OCCURRENCE'
  | 'TEXT_TOO_LONG'
  | 'INVALID_CATEGORY';

export class LedgerValidationError extends Error {
  constructor(readonly violations: readonly LedgerViolation[]) {
    super(`Invalid transaction: ${violations.join(', ')}`);
    this.name = 'LedgerValidationError';
  }
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkMoney(m: Money, out: LedgerViolation[], rule: 'positive' | 'nonzero' | 'nonnegative'): void {
  if (!isSupportedCurrency(m.currency)) out.push('UNSUPPORTED_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) out.push('AMOUNT_NOT_POSITIVE');
  else if (rule === 'positive' && m.minor <= 0) out.push('AMOUNT_NOT_POSITIVE');
  else if (rule === 'nonzero' && m.minor === 0) out.push('AMOUNT_ZERO');
  else if (rule === 'nonnegative' && m.minor < 0) out.push('FEE_NEGATIVE');
}

/** Returns every invariant the draft violates (empty = valid). */
export function validateDraft(d: TransactionDraft): LedgerViolation[] {
  const v: LedgerViolation[] = [];
  if (
    !ISO_INSTANT.test(d.occurredAt) ||
    Number.isNaN(Date.parse(d.occurredAt)) ||
    !ISO_DATE.test(d.occurredLocalDate) ||
    !Number.isInteger(d.tzOffsetMin) ||
    Math.abs(d.tzOffsetMin) > 840
  ) {
    v.push('INVALID_OCCURRENCE');
  }
  if ((d.description?.length ?? 0) > 120 || (d.place?.length ?? 0) > 120 || (d.note?.length ?? 0) > 500) {
    v.push('TEXT_TOO_LONG');
  }
  switch (d.type) {
    case 'OPENING_BALANCE':
      checkMoney(d.amount, v, 'positive');
      break;
    case 'EXPENSE':
      checkMoney(d.amount, v, 'positive');
      if (!Number.isInteger(d.categoryId) || d.categoryId <= 0) v.push('INVALID_CATEGORY');
      break;
    case 'FX_EXCHANGE':
      checkMoney(d.given, v, 'positive');
      checkMoney(d.received, v, 'positive');
      if (d.given.currency === d.received.currency) v.push('FX_SAME_CURRENCY');
      break;
    case 'ATM_WITHDRAWAL':
      checkMoney(d.received, v, 'positive');
      if (d.fee) {
        checkMoney(d.fee, v, 'nonnegative');
        if (d.fee.currency !== d.received.currency) v.push('FEE_CURRENCY_MISMATCH');
      }
      break;
    case 'CASH_ADJUSTMENT':
      checkMoney(d.delta, v, 'nonzero');
      break;
  }
  return [...new Set(v)];
}

/**
 * The financial semantics of each transaction type on physical cash (FINANCIAL_DOMAIN.md):
 * - opening balance: +amount;  cash expense: −amount;  credit expense: no cash effect;
 * - FX exchange: −given, +received;  ATM: +cash received (fee is charged to the funding source);
 * - cash adjustment: +signed delta.
 */
export function cashEffects(d: TransactionDraft): CashEffect[] {
  switch (d.type) {
    case 'OPENING_BALANCE':
      return [{ currency: d.amount.currency, amountMinor: d.amount.minor }];
    case 'EXPENSE':
      return d.payment.method === 'CASH' ? [{ currency: d.amount.currency, amountMinor: -d.amount.minor }] : [];
    case 'FX_EXCHANGE':
      return [
        { currency: d.given.currency, amountMinor: -d.given.minor },
        { currency: d.received.currency, amountMinor: d.received.minor },
      ];
    case 'ATM_WITHDRAWAL':
      return [{ currency: d.received.currency, amountMinor: d.received.minor }];
    case 'CASH_ADJUSTMENT':
      return [{ currency: d.delta.currency, amountMinor: d.delta.minor }];
  }
}

/** Whether a transaction type counts as trip spending. Only EXPENSE does (ATM/FX principal never). */
export function isExpense(d: Pick<TransactionDraft, 'type'>): boolean {
  return d.type === 'EXPENSE';
}
