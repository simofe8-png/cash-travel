// Wires real SQLite repositories + use-cases for application-level tests.
import { AtmService } from '../application/atm/AtmService';
import { ReconciliationService } from '../application/cash/ReconciliationService';
import { CardCostService } from '../application/cards/CardCostService';
import { CardService } from '../application/cards/CardService';
import { FxRateService } from '../application/fx/FxRateService';
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import { BUNDLED_CARD_RULE_SET } from '../data/cardRules/bundledRuleSet';
import { SqliteCardRuleRepository } from '../data/SqliteCardRuleRepository';
import { SqliteFxRateRepository } from '../data/SqliteFxRateRepository';
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

export function testServices(providers: FxRateProvider[] = []) {
  const db = migratedDb();
  const clock = new FakeClock();
  const ledger = new SqliteLedgerRepository(db, clock.now);
  const trips = new SqliteTripRepository(db, clock.now);
  const categories = new SqliteCategoryRepository(db, clock.now);
  const cards = new SqliteCardRepository(db, clock.now);
  const uow = new SqliteUnitOfWork(db);
  const fxRates = new SqliteFxRateRepository(db);
  const fxRateService = new FxRateService(fxRates, providers, clock);
  const cardRules = new SqliteCardRuleRepository(db);
  const cardCostService = new CardCostService(cards, cardRules, fxRateService, clock);
  cardCostService.installRuleSet(BUNDLED_CARD_RULE_SET);
  const cardService = new CardService(cards);
  const tripService = new TripService(trips, ledger, uow, clock);
  const expenseService = new ExpenseService(ledger, trips, categories, cards, uow, clock, cardCostService);
  const categoryService = new CategoryService(categories, ledger, uow);
  const fxService = new FxExchangeService(ledger, uow, clock);
  const atmService = new AtmService(ledger, cards, uow, clock, cardCostService);
  const reconciliationService = new ReconciliationService(ledger, uow, clock);
  return { db, clock, ledger, trips, categories, cards, uow, fxRates, fxRateService, cardRules, cardCostService, cardService, tripService, expenseService, categoryService, fxService, atmService, reconciliationService };
}
