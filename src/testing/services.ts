// Wires real SQLite repositories + use-cases for application-level tests.
import { AtmService } from '../application/atm/AtmService';
import { CategoryService } from '../application/expenses/CategoryService';
import { ExpenseService } from '../application/expenses/ExpenseService';
import { FxExchangeService } from '../application/fx/FxExchangeService';
import { TripService } from '../application/trips/TripService';
import { SqliteCardRepository } from '../data/SqliteCardRepository';
import { SqliteCategoryRepository } from '../data/SqliteCategoryRepository';
import { SqliteLedgerRepository } from '../data/SqliteLedgerRepository';
import { SqliteTripRepository } from '../data/SqliteTripRepository';
import { SqliteUnitOfWork } from '../data/SqliteUnitOfWork';
import { FakeClock, migratedDb } from './fixtures';

export function testServices() {
  const db = migratedDb();
  const clock = new FakeClock();
  const ledger = new SqliteLedgerRepository(db, clock.now);
  const trips = new SqliteTripRepository(db, clock.now);
  const categories = new SqliteCategoryRepository(db, clock.now);
  const cards = new SqliteCardRepository(db, clock.now);
  const uow = new SqliteUnitOfWork(db);
  const tripService = new TripService(trips, ledger, uow, clock);
  const expenseService = new ExpenseService(ledger, trips, categories, cards, uow, clock);
  const categoryService = new CategoryService(categories, ledger, uow);
  const fxService = new FxExchangeService(ledger, uow, clock);
  const atmService = new AtmService(ledger, cards, uow, clock);
  return { db, clock, ledger, trips, categories, cards, uow, tripService, expenseService, categoryService, fxService, atmService };
}
