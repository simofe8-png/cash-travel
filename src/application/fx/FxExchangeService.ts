import type { FxExchangeDraft, Occurrence } from '../../domain/ledger';
import type { Money } from '../../domain/money';
import { occurrence } from '../../domain/time';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export interface FxExchangeInput {
  readonly tripId: number;
  /** Actual cash handed over. */
  readonly given: Money;
  /** Actual cash received. */
  readonly received: Money;
  readonly occurrence?: Occurrence;
  readonly place?: string | null;
  readonly note?: string | null;
}

/**
 * Cash currency exchange: one atomic transaction with two ledger legs (−given, +received).
 * Never an expense; no separate exchange-counter fee field in V1 (the cost is implicit in the rate).
 */
export class FxExchangeService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  exchange(input: FxExchangeInput): number {
    return this.uow.run(() => this.ledger.record(this.toDraft(input)));
  }

  editExchange(id: number, input: FxExchangeInput): void {
    const stored = this.ledger.get(id);
    if (!stored || stored.draft.type !== 'FX_EXCHANGE') throw new Error('Not an FX exchange');
    this.uow.run(() => this.ledger.revise(id, this.toDraft(input)));
  }

  private toDraft(i: FxExchangeInput): FxExchangeDraft {
    return {
      ...(i.occurrence ?? occurrence(this.clock.now(), this.clock.offsetMinutes())),
      tripId: i.tripId,
      type: 'FX_EXCHANGE',
      given: i.given,
      received: i.received,
      description: null,
      place: i.place ?? null,
      note: i.note ?? null,
    };
  }
}
