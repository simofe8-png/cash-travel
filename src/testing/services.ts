// Wires real SQLite repositories + use-cases for application-level tests.
import { TripService } from '../application/trips/TripService';
import { SqliteLedgerRepository } from '../data/SqliteLedgerRepository';
import { SqliteTripRepository } from '../data/SqliteTripRepository';
import { SqliteUnitOfWork } from '../data/SqliteUnitOfWork';
import { FakeClock, migratedDb } from './fixtures';

export function testServices() {
  const db = migratedDb();
  const clock = new FakeClock();
  const ledger = new SqliteLedgerRepository(db, clock.now);
  const trips = new SqliteTripRepository(db, clock.now);
  const uow = new SqliteUnitOfWork(db);
  const tripService = new TripService(trips, ledger, uow, clock);
  return { db, clock, ledger, trips, uow, tripService };
}
