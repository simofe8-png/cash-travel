import type { ReferenceRate } from '../../domain/fx';

export interface FxRateRepository {
  /** Inserts new rates; an existing (source, quote, date) row is kept unchanged (published rates are immutable). */
  save(rates: readonly ReferenceRate[], fetchedAt: string): number;
  /** Cached EUR-based rates for the currencies with rate dates in [fromDate, toDate]. */
  find(currencies: readonly string[], fromDate: string, toDate: string): ReferenceRate[];
}
