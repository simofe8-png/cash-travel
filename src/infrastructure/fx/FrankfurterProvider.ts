import type { FxRateProvider } from '../../application/ports/FxRateProvider';
import { PIVOT_CURRENCY, type ReferenceRate } from '../../domain/fx';
import { getJson, isIsoDate, isObject, ProviderError, toRateString, type FetchLike } from './http';

/**
 * European Central Bank reference rates via the keyless Frankfurter API (ADR-0004).
 * Time-series endpoint: one request covers a whole date range.
 */
export class FrankfurterProvider implements FxRateProvider {
  readonly source = 'ECB';

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly baseUrl = 'https://api.frankfurter.dev/v1',
  ) {}

  async fetchRates(fromDate: string, toDate: string, currencies: readonly string[]): Promise<ReferenceRate[]> {
    const wanted = new Set(currencies.filter((c) => c !== PIVOT_CURRENCY));
    if (wanted.size === 0) return [];
    // A single date returns the latest publication on or before it; a range returns the business
    // days inside it (callers widen the range by the rate window to include prior publications).
    const url =
      fromDate === toDate
        ? `${this.baseUrl}/${fromDate}?base=${PIVOT_CURRENCY}`
        : `${this.baseUrl}/${fromDate}..${toDate}?base=${PIVOT_CURRENCY}`;
    const body = await getJson(this.fetchFn, url);
    if (!isObject(body) || body.base !== PIVOT_CURRENCY || !isObject(body.rates)) throw new ProviderError('Unexpected ECB response');

    const out: ReferenceRate[] = [];
    const add = (date: unknown, rates: unknown) => {
      if (!isIsoDate(date) || !isObject(rates)) throw new ProviderError('Unexpected ECB response');
      for (const [quote, value] of Object.entries(rates)) {
        if (!wanted.has(quote)) continue;
        const rate = toRateString(value);
        if (rate) out.push({ source: this.source, quote, rate, rateDate: date });
      }
    };
    if (isIsoDate(body.date)) add(body.date, body.rates);
    else for (const [date, rates] of Object.entries(body.rates)) add(date, rates);
    return out;
  }
}
