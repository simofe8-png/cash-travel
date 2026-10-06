import type { FxRateProvider } from '../../application/ports/FxRateProvider';
import { PIVOT_CURRENCY, type ReferenceRate } from '../../domain/fx';
import { addDays } from '../../domain/time';
import { getJson, isIsoDate, isObject, ProviderError, toRateString, type FetchLike } from './http';

/**
 * Secondary reference source (fawazahmed0/currency-api, daily snapshots via jsDelivr) used only
 * for currencies the ECB does not publish (e.g. VND, GEL, AED, JOD, EGP, MAD). Rates keep their
 * own source label so reports can show where a number came from (ADR-0004).
 */
export class CurrencyApiProvider implements FxRateProvider {
  readonly source = 'CURRENCY_API';

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly urlFor = (date: string) =>
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/eur.json`,
    private readonly maxDays = 31,
  ) {}

  async fetchRates(fromDate: string, toDate: string, currencies: readonly string[]): Promise<ReferenceRate[]> {
    const wanted = currencies.filter((c) => c !== PIVOT_CURRENCY);
    if (wanted.length === 0) return [];
    const out: ReferenceRate[] = [];
    let failures = 0;
    let days = 0;
    for (let d = fromDate; d <= toDate && days < this.maxDays; d = addDays(d, 1), days++) {
      try {
        const body = await getJson(this.fetchFn, this.urlFor(d));
        if (!isObject(body) || !isIsoDate(body.date) || !isObject(body.eur)) throw new ProviderError('Unexpected response');
        const eur = body.eur;
        for (const quote of wanted) {
          const rate = toRateString(eur[quote.toLowerCase()]);
          if (rate) out.push({ source: this.source, quote, rate, rateDate: body.date });
        }
      } catch (e) {
        failures++;
        if (!(e instanceof ProviderError)) throw e;
      }
    }
    if (out.length === 0 && failures > 0) throw new ProviderError('No rates retrieved');
    return out;
  }
}
