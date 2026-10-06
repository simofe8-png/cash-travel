import type { TransactionType } from '../../domain/ledger';

/** Display row of one active transaction (read model; never used for financial writes). */
export interface JournalRow {
  readonly id: number;
  readonly type: TransactionType;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly tzOffsetMin: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly counterAmountMinor: number | null;
  readonly counterCurrency: string | null;
  readonly categoryId: number | null;
  readonly paymentMethod: 'CASH' | 'CARD' | null;
  readonly cardId: number | null;
  readonly feeMinor: number | null;
  readonly description: string | null;
  readonly place: string | null;
  readonly note: string | null;
  readonly hasReceipt: boolean;
}

export interface JournalFilter {
  readonly limit?: number;
}

export interface JournalQueries {
  /** Active transactions of a trip, newest first by occurrence. */
  list(tripId: number, filter?: JournalFilter): JournalRow[];
}
