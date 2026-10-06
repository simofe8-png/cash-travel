import { add, type Money } from '../money';
import type { AtmWithdrawalDraft } from '../ledger';

/**
 * ATM semantics (FINANCIAL_DOMAIN.md):
 * - the cash actually received increases that cash wallet and is NOT an expense;
 * - the optional local ATM fee is charged to the funding card together with the principal, so it
 *   never touches physical cash; it is a trip cost (reported as "ATM fees", see ADR-0006);
 * - the card is debited principal + fee in the cash currency, later billed in its billing currency.
 */
export function atmCardDebit(d: Pick<AtmWithdrawalDraft, 'received' | 'fee'>): Money {
  return d.fee ? add(d.received, d.fee) : d.received;
}

/** The trip cost of a withdrawal: only the local ATM fee (principal is never a cost). */
export function atmFeeCost(d: Pick<AtmWithdrawalDraft, 'fee'>): Money | null {
  return d.fee && d.fee.minor > 0 ? d.fee : null;
}
