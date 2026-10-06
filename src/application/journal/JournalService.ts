import type { JournalFilter, JournalQueries, JournalRow } from '../ports/JournalQueries';

/** Read-side access to the transaction history (Home recent actions, Journal). */
export class JournalService {
  constructor(private readonly queries: JournalQueries) {}

  recent(tripId: number, limit = 5): JournalRow[] {
    return this.queries.list(tripId, { limit });
  }

  list(tripId: number, filter: JournalFilter = {}): JournalRow[] {
    return this.queries.list(tripId, filter);
  }
}
