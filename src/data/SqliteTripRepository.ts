import type { SqlDatabase } from '../application/ports/SqlDatabase';
import type { FastEntryDefaults, TripRepository } from '../application/ports/TripRepository';
import type { Trip, TripDetails } from '../domain/trip';

interface TripRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  reporting_currency: string;
  last_currency: string | null;
  last_payment_method: 'CASH' | 'CARD' | null;
  last_card_id: number | null;
  created_at: string;
  updated_at: string;
}

const toTrip = (r: TripRow): Trip => ({
  id: r.id,
  name: r.name,
  startDate: r.start_date,
  endDate: r.end_date,
  reportingCurrency: r.reporting_currency,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Trip details and app settings. Never touches financial tables. */
export class SqliteTripRepository implements TripRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => string,
  ) {}

  create(d: TripDetails): number {
    const t = this.now();
    return this.db.run(
      'INSERT INTO trips (name, start_date, end_date, reporting_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [d.name.trim(), d.startDate, d.endDate, d.reportingCurrency, t, t],
    ).lastInsertRowId;
  }

  delete(id: number): void {
    if (this.db.run('DELETE FROM trips WHERE id = ?', [id]).changes !== 1) throw new Error(`Trip ${id} not found`);
  }

  updateDetails(id: number, d: TripDetails): void {
    const changed = this.db.run(
      'UPDATE trips SET name = ?, start_date = ?, end_date = ?, reporting_currency = ?, updated_at = ? WHERE id = ?',
      [d.name.trim(), d.startDate, d.endDate, d.reportingCurrency, this.now(), id],
    ).changes;
    if (changed !== 1) throw new Error(`Trip ${id} not found`);
  }

  get(id: number): Trip | undefined {
    const r = this.db.get<TripRow>('SELECT * FROM trips WHERE id = ?', [id]);
    return r ? toTrip(r) : undefined;
  }

  list(): Trip[] {
    return this.db.all<TripRow>('SELECT * FROM trips ORDER BY start_date DESC, id DESC').map(toTrip);
  }

  getSetting(key: string): string | null {
    return this.db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])?.value ?? null;
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) this.db.run('DELETE FROM app_settings WHERE key = ?', [key]);
    else this.db.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  fastEntryDefaults(tripId: number): FastEntryDefaults {
    const r = this.db.get<TripRow>('SELECT last_currency, last_payment_method, last_card_id FROM trips WHERE id = ?', [tripId]);
    return { currency: r?.last_currency ?? null, paymentMethod: r?.last_payment_method ?? null, cardId: r?.last_card_id ?? null };
  }

  setFastEntryDefaults(tripId: number, d: FastEntryDefaults): void {
    this.db.run('UPDATE trips SET last_currency = ?, last_payment_method = ?, last_card_id = ? WHERE id = ?', [
      d.currency,
      d.paymentMethod,
      d.cardId,
      tripId,
    ]);
  }
}
