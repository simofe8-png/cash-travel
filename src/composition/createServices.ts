import { AtmService } from '../application/atm/AtmService';
import { CardCostService } from '../application/cards/CardCostService';
import { CardService } from '../application/cards/CardService';
import { ReconciliationService } from '../application/cash/ReconciliationService';
import { CategoryService } from '../application/expenses/CategoryService';
import { ExpenseService } from '../application/expenses/ExpenseService';
import { FxExchangeService } from '../application/fx/FxExchangeService';
import { FxRateService } from '../application/fx/FxRateService';
import type { Clock } from '../application/ports/Clock';
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { JournalService } from '../application/journal/JournalService';
import { ReportingService } from '../application/reporting/ReportingService';
import { TripService } from '../application/trips/TripService';
import { BUNDLED_CARD_RULE_SET } from '../data/cardRules/bundledRuleSet';
import { SqliteCardRepository } from '../data/SqliteCardRepository';
import { SqliteCardRuleRepository } from '../data/SqliteCardRuleRepository';
import { SqliteCategoryRepository } from '../data/SqliteCategoryRepository';
import { SqliteFxRateRepository } from '../data/SqliteFxRateRepository';
import { SqliteJournalQueries } from '../data/SqliteJournalQueries';
import { SqliteLedgerRepository } from '../data/SqliteLedgerRepository';
import { SqliteReportingQueries } from '../data/SqliteReportingQueries';
import { SqliteTripRepository } from '../data/SqliteTripRepository';
import { SqliteUnitOfWork } from '../data/SqliteUnitOfWork';

/** Wires repositories and use-cases over a migrated database. Shared by the app and tests. */
export function createServices(db: SqlDatabase, clock: Clock, providers: readonly FxRateProvider[]) {
  const ledger = new SqliteLedgerRepository(db, clock.now);
  const trips = new SqliteTripRepository(db, clock.now);
  const categories = new SqliteCategoryRepository(db, clock.now);
  const cards = new SqliteCardRepository(db, clock.now);
  const fxRates = new SqliteFxRateRepository(db);
  const cardRules = new SqliteCardRuleRepository(db);
  const uow = new SqliteUnitOfWork(db);

  const fxRateService = new FxRateService(fxRates, providers, clock);
  const cardCostService = new CardCostService(cards, cardRules, fxRateService, clock);
  cardCostService.installRuleSet(BUNDLED_CARD_RULE_SET);

  return {
    ledger,
    trips,
    categories,
    cards,
    fxRates,
    cardRules,
    uow,
    fxRateService,
    cardCostService,
    cardService: new CardService(cards),
    tripService: new TripService(trips, ledger, uow, clock),
    expenseService: new ExpenseService(ledger, trips, categories, cards, uow, clock, cardCostService),
    categoryService: new CategoryService(categories, ledger, uow),
    fxService: new FxExchangeService(ledger, uow, clock),
    atmService: new AtmService(ledger, cards, uow, clock, cardCostService),
    reconciliationService: new ReconciliationService(ledger, uow, clock),
    journalService: new JournalService(new SqliteJournalQueries(db)),
    reportingService: new ReportingService(trips, ledger, new SqliteReportingQueries(db), fxRateService, cardCostService, clock),
  };
}

export type AppServices = ReturnType<typeof createServices>;
