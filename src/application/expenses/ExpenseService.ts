import type { ExpenseDraft, ExpensePayment, Occurrence } from '../../domain/ledger';
import type { Money } from '../../domain/money';
import { occurrence } from '../../domain/time';
import type { CardRepository } from '../ports/CardRepository';
import type { CategoryRepository } from '../ports/CategoryRepository';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { TripRepository } from '../ports/TripRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export interface ExpenseInput {
  readonly tripId: number;
  readonly amount: Money;
  readonly categoryId: number;
  readonly payment: ExpensePayment;
  /** Defaults to now. */
  readonly occurrence?: Occurrence;
  readonly description?: string | null;
  readonly place?: string | null;
  readonly note?: string | null;
}

export interface ExpenseDefaults {
  readonly currency: string;
  readonly payment: ExpensePayment;
}

export class ExpenseError extends Error {
  constructor(readonly code: 'TRIP_NOT_FOUND' | 'CATEGORY_INVALID' | 'CARD_INVALID' | 'NOT_AN_EXPENSE') {
    super(code);
    this.name = 'ExpenseError';
  }
}

/** Expense semantics: cash expense reduces the wallet; credit expense is spending without cash effect. */
export class ExpenseService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly trips: TripRepository,
    private readonly categories: CategoryRepository,
    private readonly cards: CardRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  addExpense(input: ExpenseInput): number {
    const draft = this.toDraft(input);
    this.assertReferences(draft, null);
    return this.uow.run(() => {
      const id = this.ledger.record(draft);
      this.remember(draft);
      return id;
    });
  }

  editExpense(id: number, input: ExpenseInput): void {
    const stored = this.ledger.get(id);
    if (!stored || stored.draft.type !== 'EXPENSE') throw new ExpenseError('NOT_AN_EXPENSE');
    const draft = this.toDraft(input);
    this.assertReferences(draft, stored.draft);
    this.uow.run(() => this.ledger.revise(id, draft));
  }

  /** Fast-entry defaults: last-used currency/payment for this trip, else sensible fallbacks. */
  defaults(tripId: number): ExpenseDefaults {
    const trip = this.trips.get(tripId);
    if (!trip) throw new ExpenseError('TRIP_NOT_FOUND');
    const last = this.trips.fastEntryDefaults(tripId);
    const wallets = this.ledger.balances(tripId);
    const currency = last.currency ?? wallets.find((w) => w.currency !== trip.reportingCurrency)?.currency ?? wallets[0]?.currency ?? trip.reportingCurrency;
    let payment: ExpensePayment = { method: 'CASH' };
    if (last.paymentMethod === 'CARD') {
      const card = last.cardId !== null ? this.cards.get(last.cardId) : undefined;
      payment = { method: 'CARD', cardId: card && !card.archived ? card.id : null };
    }
    return { currency, payment };
  }

  private toDraft(i: ExpenseInput): ExpenseDraft {
    return {
      ...(i.occurrence ?? occurrence(this.clock.now(), this.clock.offsetMinutes())),
      tripId: i.tripId,
      type: 'EXPENSE',
      amount: i.amount,
      categoryId: i.categoryId,
      payment: i.payment,
      description: i.description ?? null,
      place: i.place ?? null,
      note: i.note ?? null,
    };
  }

  private assertReferences(d: ExpenseDraft, previous: ExpenseDraft | null): void {
    if (!this.trips.get(d.tripId)) throw new ExpenseError('TRIP_NOT_FOUND');
    const cat = this.categories.get(d.categoryId);
    // An archived category stays valid only on an existing expense that already uses it.
    if (!cat || (cat.archived && previous?.categoryId !== d.categoryId)) throw new ExpenseError('CATEGORY_INVALID');
    if (d.payment.method === 'CARD' && d.payment.cardId !== null) {
      const card = this.cards.get(d.payment.cardId);
      const unchanged = previous?.payment.method === 'CARD' && previous.payment.cardId === d.payment.cardId;
      if (!card || (card.archived && !unchanged)) throw new ExpenseError('CARD_INVALID');
    }
  }

  private remember(d: ExpenseDraft): void {
    this.trips.setFastEntryDefaults(d.tripId, {
      currency: d.amount.currency,
      paymentMethod: d.payment.method,
      cardId: d.payment.method === 'CARD' ? d.payment.cardId : null,
    });
  }
}
