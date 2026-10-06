export interface IntegrityQueries {
  /** SQLite structural check ('ok' when healthy). */
  quickCheck(): string;
  foreignKeyViolations(): number;
  tripIds(): number[];
  /** Card charges attached to transactions that are not card-funded. */
  misplacedCardCharges(): number[];
  /** Ledger entries whose wallet belongs to another trip than their transaction. */
  crossTripEntries(): number;
}
