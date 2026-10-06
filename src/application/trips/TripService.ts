import { localDateOf, occurrence } from '../../domain/time';
import { defaultTripId, tripStatus, validateTripDetails, type Trip, type TripDetails, type TripStatus, type TripViolation } from '../../domain/trip';
import { isSupportedCurrency, type Money } from '../../domain/money';
import type { Clock } from '../ports/Clock';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { TripRepository } from '../ports/TripRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export class TripValidationError extends Error {
  constructor(readonly violations: readonly (TripViolation | 'DUPLICATE_OPENING_CURRENCY' | 'OPENING_NOT_POSITIVE')[]) {
    super(`Invalid trip: ${violations.join(', ')}`);
    this.name = 'TripValidationError';
  }
}

export interface TripSummary extends Trip {
  readonly status: TripStatus;
}

const CURRENT_TRIP_KEY = 'current_trip_id';

/** Trip lifecycle use-cases. Opening balances are ledger events, never stored balances. */
export class TripService {
  constructor(
    private readonly trips: TripRepository,
    private readonly ledger: LedgerRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  today(): string {
    return localDateOf(this.clock.now(), this.clock.offsetMinutes());
  }

  /** Creates a trip and its opening cash balances atomically, and makes it the current trip. */
  createTrip(details: TripDetails, openingBalances: readonly Money[]): number {
    this.validate(details, openingBalances);
    return this.uow.run(() => {
      const id = this.trips.create(details);
      this.writeOpenings(id, openingBalances);
      this.trips.setSetting(CURRENT_TRIP_KEY, String(id));
      return id;
    });
  }

  /**
   * Edits trip details (name, dates, reporting currency). Never touches any transaction: changing
   * dates only changes how existing transactions are classified (pre/during/post trip).
   */
  updateTripDetails(id: number, details: TripDetails): void {
    const v = validateTripDetails(details);
    if (v.length) throw new TripValidationError(v);
    this.trips.updateDetails(id, details);
  }

  /** Trip Setup "save" in edit mode: details and opening balances change together or not at all. */
  updateTrip(id: number, details: TripDetails, openingBalances: readonly Money[]): void {
    this.validate(details, openingBalances);
    this.uow.run(() => {
      this.trips.updateDetails(id, details);
      this.setOpeningBalances(id, openingBalances);
    });
  }

  /**
   * Reconciles the opening balances with the desired list through the Ledger: changed amounts are
   * revised (auditable), new currencies recorded, removed currencies soft-deleted. Atomic.
   */
  setOpeningBalances(tripId: number, desired: readonly Money[]): void {
    this.validateOpenings(desired);
    this.uow.run(() => {
      const existing = this.ledger.openingBalances(tripId);
      for (const e of existing) {
        const want = desired.find((d) => d.currency === e.amount.currency);
        if (!want) {
          this.ledger.softDelete(e.id);
        } else if (want.minor !== e.amount.minor) {
          const stored = this.ledger.get(e.id)!;
          this.ledger.revise(e.id, { ...stored.draft, type: 'OPENING_BALANCE', amount: want } as const);
        }
      }
      const fresh = desired.filter((d) => !existing.some((e) => e.amount.currency === d.currency));
      this.writeOpenings(tripId, fresh);
    });
  }

  openingBalances(tripId: number): Money[] {
    return this.ledger.openingBalances(tripId).map((o) => o.amount);
  }

  listTrips(): TripSummary[] {
    const today = this.today();
    return this.trips.list().map((t) => ({ ...t, status: tripStatus(t, today) }));
  }

  getTrip(id: number): TripSummary | undefined {
    const t = this.trips.get(id);
    return t ? { ...t, status: tripStatus(t, this.today()) } : undefined;
  }

  /** The current trip context: the explicitly selected trip, else the most relevant by date. */
  currentTrip(): TripSummary | undefined {
    const stored = Number(this.trips.getSetting(CURRENT_TRIP_KEY));
    const selected = Number.isInteger(stored) && stored > 0 ? this.getTrip(stored) : undefined;
    if (selected) return selected;
    const fallback = defaultTripId(this.trips.list(), this.today());
    return fallback === null ? undefined : this.getTrip(fallback);
  }

  selectTrip(id: number): void {
    if (!this.trips.get(id)) throw new Error(`Trip ${id} not found`);
    this.trips.setSetting(CURRENT_TRIP_KEY, String(id));
  }

  private writeOpenings(tripId: number, balances: readonly Money[]): void {
    const occ = occurrence(this.clock.now(), this.clock.offsetMinutes());
    for (const amount of balances) {
      this.ledger.record({ ...occ, tripId, type: 'OPENING_BALANCE', amount });
    }
  }

  private validate(details: TripDetails, openings: readonly Money[]): void {
    const v = validateTripDetails(details);
    if (v.length) throw new TripValidationError(v);
    this.validateOpenings(openings);
  }

  private validateOpenings(openings: readonly Money[]): void {
    const currencies = openings.map((o) => o.currency);
    if (new Set(currencies).size !== currencies.length) throw new TripValidationError(['DUPLICATE_OPENING_CURRENCY']);
    if (openings.some((o) => !isSupportedCurrency(o.currency))) throw new TripValidationError(['UNSUPPORTED_CURRENCY']);
    if (openings.some((o) => !Number.isSafeInteger(o.minor) || o.minor <= 0)) throw new TripValidationError(['OPENING_NOT_POSITIVE']);
  }
}
