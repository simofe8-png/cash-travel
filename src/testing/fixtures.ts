// Test fixtures: a migrated in-memory database with deterministic clock.
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { migrate } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import { NodeSqliteDatabase } from './NodeSqliteDatabase';

export const T0 = '2026-11-02T08:00:00.000Z';

/** Deterministic clock advancing one second per call. */
export function testClock(start = T0): () => string {
  let ms = Date.parse(start);
  return () => {
    const s = new Date(ms).toISOString();
    ms += 1000;
    return s;
  };
}

export function migratedDb(): NodeSqliteDatabase {
  const db = new NodeSqliteDatabase();
  migrate(db, MIGRATIONS, () => T0);
  return db;
}

export function insertTrip(db: SqlDatabase, id = 1, start = '2026-11-01', end = '2026-11-20'): number {
  db.run('INSERT INTO trips (id, name, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    `Trip ${id}`,
    start,
    end,
    T0,
    T0,
  ]);
  return id;
}

export function insertCard(db: SqlDatabase, issuer = 'ISRACARD'): number {
  return db.run('INSERT INTO cards (issuer, created_at) VALUES (?, ?)', [issuer, T0]).lastInsertRowId;
}

export function categoryId(db: SqlDatabase, key = 'FOOD'): number {
  return db.get<{ id: number }>('SELECT id FROM categories WHERE builtin_key = ?', [key])!.id;
}

export const at = (localDate = '2026-11-02', occurredAt = T0, tzOffsetMin = 420) => ({
  occurredAt,
  occurredLocalDate: localDate,
  tzOffsetMin,
});

/** Mutable test clock implementing the Clock port. */
export class FakeClock {
  constructor(
    public instant = T0,
    public offset = 420,
  ) {}
  now = () => this.instant;
  offsetMinutes = () => this.offset;
  set(instant: string, offset = this.offset) {
    this.instant = instant;
    this.offset = offset;
  }
}
