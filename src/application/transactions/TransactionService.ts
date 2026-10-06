import type { StoredTransaction } from '../../domain/ledger';
import { parseAmount } from '../../domain/money';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export interface TransactionDetails {
  readonly tx: StoredTransaction;
  readonly history: ReturnType<LedgerRepository['history']>;
}

export class ActualChargeError extends Error {
  constructor(readonly code: 'INVALID_AMOUNT' | 'NOT_CARD') {
    super(code);
    this.name = 'ActualChargeError';
  }
}

/** Action Details use-cases: read, record the actual card charge, soft delete. */
export class TransactionService {
  /** Non-financial cleanup run after a delete commits (e.g. removing the receipt photo). */
  private readonly onDelete: ((id: number) => void)[] = [];

  constructor(
    private readonly ledger: LedgerRepository,
    private readonly uow: UnitOfWork,
  ) {}

  details(id: number): TransactionDetails | undefined {
    const tx = this.ledger.get(id);
    return tx ? { tx, history: this.ledger.history(id) } : undefined;
  }

  /** Enters (or clears with empty text) the actual billed charge, in the card's billing currency. */
  setActualCharge(id: number, text: string): void {
    const tx = this.ledger.get(id);
    if (!tx?.cardCharge) throw new ActualChargeError('NOT_CARD');
    if (text.trim() === '') {
      this.uow.run(() => this.ledger.setActualCharge(id, null));
      return;
    }
    const p = parseAmount(text, tx.cardCharge.billingCurrency);
    if (!p.ok || p.minor <= 0) throw new ActualChargeError('INVALID_AMOUNT');
    this.uow.run(() => this.ledger.setActualCharge(id, p.minor));
  }

  /** Soft delete: immediately removes the action from balances, Journal and reports; history kept. */
  delete(id: number): void {
    this.uow.run(() => this.ledger.softDelete(id));
    for (const hook of this.onDelete) {
      try {
        hook(id);
      } catch {
        // Cleanup failures never undo a committed delete; startup cleanup reconciles leftovers.
      }
    }
  }

  addDeleteHook(hook: (id: number) => void): void {
    this.onDelete.push(hook);
  }
}
