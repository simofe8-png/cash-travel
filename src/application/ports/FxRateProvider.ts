import type { ReferenceRate } from '../../domain/fx';

/**
 * External reference-rate source. Adapters translate vendor responses into EUR-based
 * ReferenceRates; the domain never sees a vendor schema. Implementations must validate responses
 * and reject (throw) on anything malformed rather than return partial garbage.
 */
export interface FxRateProvider {
  readonly source: string;
  /** Rates for every publication date in [fromDate, toDate], for the given quote currencies. */
  fetchRates(fromDate: string, toDate: string, currencies: readonly string[]): Promise<ReferenceRate[]>;
}
