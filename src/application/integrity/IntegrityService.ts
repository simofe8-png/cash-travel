import type { IntegrityQueries } from '../ports/IntegrityQueries';
import type { LedgerRepository } from '../ports/LedgerRepository';

export interface IntegrityReport {
  readonly ok: boolean;
  readonly quickCheck: string;
  readonly foreignKeyViolations: number;
  /** Transaction ids whose active ledger entries differ from their derived cash effects. */
  readonly inconsistentTransactions: number[];
  readonly misplacedCardCharges: number[];
  readonly crossTripEntries: number;
}

/** Read-only audit of the authoritative data (used after migrations and in tests). */
export class IntegrityService {
  constructor(
    private readonly queries: IntegrityQueries,
    private readonly ledger: LedgerRepository,
  ) {}

  check(): IntegrityReport {
    const quickCheck = this.queries.quickCheck();
    const foreignKeyViolations = this.queries.foreignKeyViolations();
    const inconsistentTransactions = this.queries.tripIds().flatMap((id) => this.ledger.findInconsistencies(id));
    const misplacedCardCharges = this.queries.misplacedCardCharges();
    const crossTripEntries = this.queries.crossTripEntries();
    return {
      ok: quickCheck === 'ok' && foreignKeyViolations === 0 && inconsistentTransactions.length === 0 && misplacedCardCharges.length === 0 && crossTripEntries === 0,
      quickCheck,
      foreignKeyViolations,
      inconsistentTransactions,
      misplacedCardCharges,
      crossTripEntries,
    };
  }
}
