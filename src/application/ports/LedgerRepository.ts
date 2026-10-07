import type {
  CardChargeEstimate,
  StoredTransaction,
  TransactionDraft,
  WalletBalance,
} from '../../domain/ledger';
import type { Money } from '../../domain/money';

/**
 * The Ledger Engine's persistence contract — the only way financial state is created or changed.
 * Every method is atomic: the parent transaction, its ledger entries, card charge and history row
 * commit together or not at all.
 */
export interface LedgerRepository {
  record(draft: TransactionDraft, cardCharge?: CardChargeEstimate | null): number;
  /** Replaces the transaction's financial content; previous entries stay for audit at an older revision. */
  revise(id: number, draft: TransactionDraft, cardCharge?: CardChargeEstimate | null): void;
  softDelete(id: number): void;
  /** Permanently removes every transaction, ledger entry, card charge, history row and wallet of a trip. */
  purgeTrip(tripId: number): void;
  /** Records (or clears with null) the actual card charge. Never touches cash. */
  setActualCharge(id: number, actualMinor: number | null): void;
  get(id: number): StoredTransaction | undefined;
  /** Active opening-balance transactions of a trip (at most one per currency by use-case rule). */
  openingBalances(tripId: number): { id: number; amount: Money }[];
  balances(tripId: number): WalletBalance[];
  /** Integrity audit: returns ids of active transactions whose active entries differ from their derived effects. */
  findInconsistencies(tripId: number): number[];
  /** Change history of one transaction, oldest first. */
  history(id: number): { action: 'CREATE' | 'EDIT' | 'DELETE' | 'ACTUAL_CHARGE'; revision: number; changedAt: string }[];
}
