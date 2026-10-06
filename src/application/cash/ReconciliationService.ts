import type { CashAdjustmentDraft, Occurrence } from '../../domain/ledger';
import { money, type Money } from '../../domain/money';
import { occurrence } from '../../domain/time';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export interface AdjustmentInput {
  readonly tripId: number;
  /** Signed correction: positive = more cash than recorded. */
  readonly delta: Money;
  readonly note?: string | null;
  readonly occurrence?: Occurrence;
}

export interface ReconcileInput {
  readonly tripId: number;
  /** The cash actually counted in the wallet (may be zero). */
  readonly counted: Money;
  readonly note?: string | null;
}

/**
 * Reconciliation never edits a balance. It records a signed CASH_ADJUSTMENT ledger event, so the
 * balance remains Σ active entries and the correction is auditable and reversible (soft delete).
 */
export class ReconciliationService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  adjust(input: AdjustmentInput): number {
    return this.uow.run(() => this.ledger.record(this.toDraft(input)));
  }

  editAdjustment(id: number, input: AdjustmentInput): void {
    const stored = this.ledger.get(id);
    if (!stored || stored.draft.type !== 'CASH_ADJUSTMENT') throw new Error('Not a cash adjustment');
    this.uow.run(() => this.ledger.revise(id, this.toDraft(input)));
  }

  /** Difference between counted cash and the derived balance (counted − recorded). */
  difference(tripId: number, counted: Money): Money {
    const current = this.ledger.balances(tripId).find((b) => b.currency === counted.currency)?.balanceMinor ?? 0;
    return money(counted.minor - current, counted.currency);
  }

  /**
   * "I counted X": records the adjustment that makes the derived balance equal X.
   * Returns null when the count already matches (nothing recorded).
   */
  reconcile(input: ReconcileInput): number | null {
    if (!Number.isSafeInteger(input.counted.minor) || input.counted.minor < 0) throw new Error('Counted cash cannot be negative');
    return this.uow.run(() => {
      const delta = this.difference(input.tripId, input.counted);
      if (delta.minor === 0) return null;
      return this.ledger.record(this.toDraft({ tripId: input.tripId, delta, note: input.note }));
    });
  }

  private toDraft(i: AdjustmentInput): CashAdjustmentDraft {
    return {
      ...(i.occurrence ?? occurrence(this.clock.now(), this.clock.offsetMinutes())),
      tripId: i.tripId,
      type: 'CASH_ADJUSTMENT',
      delta: i.delta,
      description: null,
      place: null,
      note: i.note ?? null,
    };
  }
}
