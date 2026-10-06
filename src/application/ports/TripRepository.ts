import type { Trip, TripDetails } from '../../domain/trip';

export interface FastEntryDefaults {
  readonly currency: string | null;
  readonly paymentMethod: 'CASH' | 'CARD' | null;
  readonly cardId: number | null;
}

export interface TripRepository {
  create(details: TripDetails): number;
  updateDetails(id: number, details: TripDetails): void;
  get(id: number): Trip | undefined;
  list(): Trip[];
  getSetting(key: string): string | null;
  setSetting(key: string, value: string | null): void;
  fastEntryDefaults(tripId: number): FastEntryDefaults;
  setFastEntryDefaults(tripId: number, d: FastEntryDefaults): void;
}
