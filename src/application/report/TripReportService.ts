import type { Card } from '../ports/CardRepository';
import type { Category } from '../../domain/expense';
import type { TripSpending } from '../../domain/reporting';
import type { CategoryService } from '../expenses/CategoryService';
import type { CardService } from '../cards/CardService';
import type { JournalDay, JournalService } from '../journal/JournalService';
import type { Clock } from '../ports/Clock';
import type { PdfExporter } from '../ports/PdfExporter';
import type { ReportingService, WalletView } from '../reporting/ReportingService';
import type { TripService, TripSummary } from '../trips/TripService';

/** Everything the PDF shows — taken only from the engines (no calculations in the template). */
export interface TripReportData {
  readonly trip: TripSummary;
  readonly generatedAt: string;
  readonly generatedOffsetMin: number;
  readonly spending: TripSpending;
  readonly wallets: readonly WalletView[];
  readonly days: readonly JournalDay[];
  readonly categories: ReadonlyMap<number, Category>;
  readonly cards: ReadonlyMap<number, Card>;
}

export class TripReportService {
  constructor(
    private readonly trips: TripService,
    private readonly reporting: ReportingService,
    private readonly journal: JournalService,
    private readonly categories: CategoryService,
    private readonly cards: CardService,
    private readonly exporter: PdfExporter,
    private readonly clock: Clock,
  ) {}

  data(tripId: number): TripReportData {
    const trip = this.trips.getTrip(tripId);
    if (!trip) throw new Error(`Trip ${tripId} not found`);
    const cats = new Map<number, Category>();
    for (const d of this.journal.days(tripId)) {
      for (const r of d.rows) {
        if (r.categoryId !== null && !cats.has(r.categoryId)) {
          const c = this.categories.get(r.categoryId);
          if (c) cats.set(c.id, c);
        }
      }
    }
    return {
      trip,
      generatedAt: this.clock.now(),
      generatedOffsetMin: this.clock.offsetMinutes(),
      spending: this.reporting.spending(tripId),
      wallets: this.reporting.wallets(tripId),
      days: this.journal.days(tripId),
      categories: cats,
      cards: new Map(this.cards.list().map((c) => [c.id, c])),
    };
  }

  /** Renders with the given template and opens the share/save sheet (no direct cloud integration). */
  share(tripId: number, render: (d: TripReportData) => string): Promise<'shared' | 'sharing_unavailable'> {
    const d = this.data(tripId);
    const safeName = d.trip.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'trip';
    return this.exporter.exportAndShare(render(d), `CashTravel-${safeName}.pdf`);
  }
}
