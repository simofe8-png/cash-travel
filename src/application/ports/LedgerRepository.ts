import type {
  CardChargeEstimate,
  StoredTransaction,
  TransactionDraft,
  WalletBalance,
} from '../../domain/ledger';

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
  /** Records (or clears with null) the actual card charge. Never touches cash. */
  setActualCharge(id: number, actualMinor: number | null): void;
  get(id: number): StoredTransaction | undefined;
  balances(tripId: number): WalletBalance[];
  /** Integrity audit: returns ids of active transactions whose active entries differ from their derived effects. */
  findInconsistencies(tripId: number): number[];
}
