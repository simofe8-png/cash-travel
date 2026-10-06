import type { Total } from '../../domain/reporting';
import type { JournalFilter, JournalQueries, JournalRow } from '../ports/JournalQueries';
import type { ReportingService } from '../reporting/ReportingService';

export interface JournalDay {
  readonly date: string;
  readonly rows: readonly JournalRow[];
  /** All EXPENSE spending of that day in the reporting currency (null when the day had none). */
  readonly expenseTotal: Total | null;
}

/** Read-side access to the transaction history (Home recent actions, Journal). */
export class JournalService {
  constructor(
    private readonly queries: JournalQueries,
    private readonly reporting: ReportingService,
  ) {}

  recent(tripId: number, limit = 5): JournalRow[] {
    return this.queries.list(tripId, { limit });
  }

  list(tripId: number, filter: JournalFilter = {}): JournalRow[] {
    return this.queries.list(tripId, filter);
  }

  /** Newest first, grouped by the local day each action happened on. */
  days(tripId: number, filter: JournalFilter = {}): JournalDay[] {
    const rows = this.queries.list(tripId, filter);
    const totals = this.reporting.dailyExpenseTotals(tripId);
    const days: JournalDay[] = [];
    for (const r of rows) {
      const last = days[days.length - 1];
      if (last && last.date === r.localDate) (last.rows as JournalRow[]).push(r);
      else days.push({ date: r.localDate, rows: [r], expenseTotal: totals.get(r.localDate) ?? null });
    }
    return days;
  }
}
