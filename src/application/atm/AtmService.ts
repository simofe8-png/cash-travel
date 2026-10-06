import { atmCardDebit } from '../../domain/atm';
import type { AtmWithdrawalDraft, CardChargeEstimate, Occurrence } from '../../domain/ledger';
import type { Money } from '../../domain/money';
import { occurrence } from '../../domain/time';
import type { CardCostService } from '../cards/CardCostService';
import type { CardRepository } from '../ports/CardRepository';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export interface AtmInput {
  readonly tripId: number;
  /** Actual physical cash received. */
  readonly received: Money;
  /** Optional local ATM fee in the cash currency. */
  readonly fee: Money | null;
  /** Funding card if configured; null = card not specified. */
  readonly cardId: number | null;
  readonly occurrence?: Occurrence;
  readonly place?: string | null;
  readonly note?: string | null;
}

export class AtmService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly cards: CardRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly cardCost: CardCostService,
  ) {}

  withdraw(input: AtmInput): number {
    const draft = this.toDraft(input);
    this.assertCard(draft.cardId, null);
    return this.uow.run(() => this.ledger.record(draft, this.cardCharge(draft)));
  }

  editWithdrawal(id: number, input: AtmInput): void {
    const stored = this.ledger.get(id);
    if (!stored || stored.draft.type !== 'ATM_WITHDRAWAL') throw new Error('Not an ATM withdrawal');
    const draft = this.toDraft(input);
    this.assertCard(draft.cardId, stored.draft.cardId);
    this.uow.run(() => this.ledger.revise(id, draft, this.cardCharge(draft)));
  }

  /**
   * The card is debited principal + local fee in the cash currency (a known fact, kept as the charged
   * amount). Its billing-currency cost is estimated by the Card Cost Engine; the actual can be entered later.
   */
  private cardCharge(d: AtmWithdrawalDraft): CardChargeEstimate {
    return this.cardCost.estimate({ original: atmCardDebit(d), chargedIn: null, cardId: d.cardId, date: d.occurredLocalDate, kind: 'ATM' });
  }

  private assertCard(cardId: number | null, previous: number | null): void {
    if (cardId === null) return;
    const card = this.cards.get(cardId);
    if (!card || (card.archived && cardId !== previous)) throw new Error('CARD_INVALID');
  }

  private toDraft(i: AtmInput): AtmWithdrawalDraft {
    return {
      ...(i.occurrence ?? occurrence(this.clock.now(), this.clock.offsetMinutes())),
      tripId: i.tripId,
      type: 'ATM_WITHDRAWAL',
      received: i.received,
      fee: i.fee && i.fee.minor > 0 ? i.fee : null,
      cardId: i.cardId,
      description: null,
      place: i.place ?? null,
      note: i.note ?? null,
    };
  }
}
