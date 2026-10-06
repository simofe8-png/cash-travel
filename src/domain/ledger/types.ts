import type { Money } from '../money';

export const TRANSACTION_TYPES = [
  'OPENING_BALANCE',
  'EXPENSE',
  'FX_EXCHANGE',
  'ATM_WITHDRAWAL',
  'CASH_ADJUSTMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** When a transaction happened: UTC instant plus the local calendar date/offset fixed at entry. */
export interface Occurrence {
  readonly occurredAt: string;
  readonly occurredLocalDate: string;
  readonly tzOffsetMin: number;
}

interface Common extends Occurrence {
  readonly tripId: number;
  readonly description?: string | null;
  readonly place?: string | null;
  readonly note?: string | null;
}

export interface OpeningBalanceDraft extends Common {
  readonly type: 'OPENING_BALANCE';
  readonly amount: Money;
}

export type ExpensePayment = { readonly method: 'CASH' } | { readonly method: 'CARD'; readonly cardId: number | null };

export interface ExpenseDraft extends Common {
  readonly type: 'EXPENSE';
  readonly amount: Money;
  readonly categoryId: number;
  readonly payment: ExpensePayment;
}

export interface FxExchangeDraft extends Common {
  readonly type: 'FX_EXCHANGE';
  readonly given: Money;
  readonly received: Money;
}

export interface AtmWithdrawalDraft extends Common {
  readonly type: 'ATM_WITHDRAWAL';
  /** Actual physical cash received — the primary fact. */
  readonly received: Money;
  /** Optional local ATM fee, in the cash currency. Charged to the funding source, not to cash. */
  readonly fee: Money | null;
  /** Funding card, if known. */
  readonly cardId: number | null;
}

export interface CashAdjustmentDraft extends Common {
  readonly type: 'CASH_ADJUSTMENT';
  /** Signed reconciliation delta (positive = found more cash than recorded). */
  readonly delta: Money;
}

export type TransactionDraft =
  | OpeningBalanceDraft
  | ExpenseDraft
  | FxExchangeDraft
  | AtmWithdrawalDraft
  | CashAdjustmentDraft;

/** One physical-cash effect: signed change to the trip's wallet in `currency`. */
export interface CashEffect {
  readonly currency: string;
  readonly amountMinor: number;
}

/** Persisted card cost of a card-paid expense or card-funded ATM withdrawal (estimate ≠ actual). */
export interface CardChargeEstimate {
  readonly billingCurrency: string;
  /** Currency the merchant/ATM charged the card in (differs from the original for DCC). */
  readonly chargedCurrency: string;
  readonly chargedAmountMinor: number | null;
  readonly status: 'ESTIMATED' | 'UNAVAILABLE';
  readonly estimateMinor: number | null;
  readonly feeStatus: 'INCLUDED' | 'NONE' | 'UNKNOWN';
  readonly rate: string | null;
  readonly rateSource: string | null;
  readonly rateDate: string | null;
  readonly ruleSetVersion: string | null;
  readonly ruleId: string | null;
  readonly estimatedAt: string | null;
}

export interface CardCharge extends CardChargeEstimate {
  readonly actualMinor: number | null;
  readonly actualEnteredAt: string | null;
}

export interface StoredTransaction {
  readonly id: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly draft: TransactionDraft;
  readonly cardCharge: CardCharge | null;
}

export interface WalletBalance {
  readonly walletId: number;
  readonly currency: string;
  /** Sum of active opening-balance entries. */
  readonly openingMinor: number;
  /** Sum of all active cash entries (the derived current balance). */
  readonly balanceMinor: number;
}
