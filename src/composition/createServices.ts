import { AtmService } from '../application/atm/AtmService';
import { CardCostService } from '../application/cards/CardCostService';
import { CardService } from '../application/cards/CardService';
import { ReconciliationService } from '../application/cash/ReconciliationService';
import { DocumentService } from '../application/documents/DocumentService';
import { CategoryService } from '../application/expenses/CategoryService';
import { ExpenseService } from '../application/expenses/ExpenseService';
import { FxExchangeService } from '../application/fx/FxExchangeService';
import { FxRateService } from '../application/fx/FxRateService';
import type { Clock } from '../application/ports/Clock';
import type { DeviceAuth } from '../application/ports/DeviceAuth';
import type { DocumentRenderer, DocumentSource, DocumentStore } from '../application/ports/DocumentStore';
import type { PdfExporter } from '../application/ports/PdfExporter';
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import type { ReceiptCamera, ReceiptStore } from '../application/ports/ReceiptStore';
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { IntegrityService } from '../application/integrity/IntegrityService';
import { JournalService } from '../application/journal/JournalService';
import { TripReportService } from '../application/report/TripReportService';
import { ReceiptService } from '../application/receipts/ReceiptService';
import { ReportingService } from '../application/reporting/ReportingService';
import { AppLockService } from '../application/security/AppLockService';
import { TransactionService } from '../application/transactions/TransactionService';
import { TripService } from '../application/trips/TripService';
import { BUNDLED_CARD_RULE_SET } from '../data/cardRules/bundledRuleSet';
import { SqliteCardRepository } from '../data/SqliteCardRepository';
import { SqliteCardRuleRepository } from '../data/SqliteCardRuleRepository';
import { SqliteCategoryRepository } from '../data/SqliteCategoryRepository';
import { SqliteFxRateRepository } from '../data/SqliteFxRateRepository';
import { SqliteIntegrityQueries } from '../data/SqliteIntegrityQueries';
import { SqliteJournalQueries } from '../data/SqliteJournalQueries';
import { SqliteLedgerRepository } from '../data/SqliteLedgerRepository';
import { SqliteReceiptRepository } from '../data/SqliteReceiptRepository';
import { SqliteReportingQueries } from '../data/SqliteReportingQueries';
import { SqliteTripDocumentRepository } from '../data/SqliteTripDocumentRepository';
import { SqliteTripRepository } from '../data/SqliteTripRepository';
import { SqliteUnitOfWork } from '../data/SqliteUnitOfWork';

/** Wires repositories and use-cases over a migrated database. Shared by the app and tests. */
export interface PlatformAdapters {
  readonly fxProviders: readonly FxRateProvider[];
  readonly receiptStore: ReceiptStore;
  readonly receiptCamera: ReceiptCamera;
  readonly deviceAuth: DeviceAuth;
  readonly pdfExporter: PdfExporter;
  readonly documentStore: DocumentStore;
  readonly documentSource: DocumentSource;
  readonly documentRenderer: DocumentRenderer;
}

export function createServices(db: SqlDatabase, clock: Clock, platform: PlatformAdapters) {
  const ledger = new SqliteLedgerRepository(db, clock.now);
  const trips = new SqliteTripRepository(db, clock.now);
  const categories = new SqliteCategoryRepository(db, clock.now);
  const cards = new SqliteCardRepository(db, clock.now);
  const fxRates = new SqliteFxRateRepository(db);
  const cardRules = new SqliteCardRuleRepository(db);
  const uow = new SqliteUnitOfWork(db);

  const fxRateService = new FxRateService(fxRates, platform.fxProviders, clock);
  const cardCostService = new CardCostService(cards, cardRules, fxRateService, clock);
  cardCostService.installRuleSet(BUNDLED_CARD_RULE_SET);
  const transactionService = new TransactionService(ledger, uow);
  const receiptRepo = new SqliteReceiptRepository(db);
  const receiptService = new ReceiptService(receiptRepo, platform.receiptStore, platform.receiptCamera, uow, clock);
  // Deleting an action also deletes its receipt photo (privacy); runs after the delete commits.
  transactionService.addDeleteHook((id) => receiptService.remove(id));
  const reportingService = new ReportingService(trips, ledger, new SqliteReportingQueries(db), fxRateService, cardCostService, clock);

  const documentRepo = new SqliteTripDocumentRepository(db);
  const documentService = new DocumentService(documentRepo, platform.documentStore, platform.documentSource, platform.documentRenderer, uow, clock);

  const tripService = new TripService(trips, ledger, uow, clock, receiptRepo, documentRepo);
  // Deleting a trip also deletes its receipt photos and document files, after the delete commits.
  tripService.addPurgeHook((released) => {
    receiptService.deleteFiles(released.receipts);
    documentService.deleteFiles(released.documents);
  });
  const categoryService = new CategoryService(categories, ledger, uow);
  const cardService = new CardService(cards);
  const journalService = new JournalService(new SqliteJournalQueries(db), reportingService);

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
    cardService,
    tripService,
    expenseService: new ExpenseService(ledger, trips, categories, cards, uow, clock, cardCostService),
    categoryService,
    fxService: new FxExchangeService(ledger, uow, clock),
    atmService: new AtmService(ledger, cards, uow, clock, cardCostService),
    reconciliationService: new ReconciliationService(ledger, uow, clock),
    journalService,
    tripReportService: new TripReportService(tripService, reportingService, journalService, categoryService, cardService, platform.pdfExporter, clock),
    reportingService,
    transactionService,
    integrityService: new IntegrityService(new SqliteIntegrityQueries(db), ledger),
    receiptService,
    documentService,
    appLockService: new AppLockService(trips, platform.deviceAuth),
  };
}

export type AppServices = ReturnType<typeof createServices>;
