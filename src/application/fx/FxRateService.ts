import { convertWithQuote, resolveQuote, windowStart, type RateQuote } from '../../domain/fx';
import type { Money } from '../../domain/money';
import { localDateOf } from '../../domain/time';
import type { Clock } from '../ports/Clock';
import type { FxRateProvider } from '../ports/FxRateProvider';
import type { FxRateRepository } from '../ports/FxRateRepository';

export type Conversion =
  | { readonly status: 'OK'; readonly amount: Money; readonly quote: RateQuote }
  | { readonly status: 'UNAVAILABLE' };

export interface RateNeed {
  readonly date: string;
  readonly currencies: readonly string[];
}

export interface RefreshResult {
  readonly saved: number;
  readonly errors: readonly string[];
}

/**
 * Reference-rate access. `quote`/`convert` are synchronous and read only the local cache, so they
 * never block or depend on the network. `refresh` is the only networked call; it runs in the
 * background, tolerates failures and never touches financial records.
 */
export class FxRateService {
  constructor(
    private readonly cache: FxRateRepository,
    /** In priority order: the first is the primary (official) source. */
    private readonly providers: readonly FxRateProvider[],
    private readonly clock: Clock,
  ) {}

  /**
   * Configured providers define the preference order; any other source already in the cache is
   * still usable (after them, alphabetically) — cached provenance-tracked rates are never ignored.
   */
  private priority(candidates: readonly { source: string }[]): string[] {
    const configured = this.providers.map((p) => p.source);
    const others = [...new Set(candidates.map((c) => c.source))].filter((s) => !configured.includes(s)).sort();
    return [...configured, ...others];
  }

  quote(from: string, to: string, date: string): RateQuote | null {
    if (from === to) return resolveQuote(from, to, date, [], []);
    const candidates = this.cache.find([from, to], windowStart(date), date);
    return resolveQuote(from, to, date, candidates, this.priority(candidates));
  }

  convert(amount: Money, to: string, date: string): Conversion {
    const q = this.quote(amount.currency, to, date);
    return q ? { status: 'OK', amount: convertWithQuote(amount, q), quote: q } : { status: 'UNAVAILABLE' };
  }

  /** Returns the needs that the cache cannot currently satisfy. */
  missing(needs: readonly RateNeed[], target: string): RateNeed[] {
    const out: RateNeed[] = [];
    for (const n of needs) {
      const miss = n.currencies.filter((c) => c !== target && !this.quote(c, target, n.date));
      if (miss.length) out.push({ date: n.date, currencies: [...miss, target] });
    }
    return out;
  }

  /**
   * Fetches rates for unsatisfied needs: one ranged request to the primary source, then the
   * secondary only for what is still missing. Never throws; dates after today are skipped.
   */
  async refresh(needs: readonly RateNeed[], target: string): Promise<RefreshResult> {
    const today = localDateOf(this.clock.now(), this.clock.offsetMinutes());
    const errors: string[] = [];
    let saved = 0;
    let pending = this.missing(
      needs.filter((n) => n.date <= today),
      target,
    );
    for (const provider of this.providers) {
      if (pending.length === 0) break;
      const currencies = [...new Set(pending.flatMap((p) => p.currencies))];
      const dates = pending.map((p) => p.date).sort();
      try {
        const rates =
          provider === this.providers[0]
            ? await provider.fetchRates(windowStart(dates[0]!), dates[dates.length - 1]!, currencies)
            : (await Promise.all(dates.map((d) => provider.fetchRates(d, d, currencies).catch(() => [])))).flat();
        saved += this.cache.save(rates, this.clock.now());
      } catch (e) {
        errors.push(`${provider.source}: ${(e as Error).message}`);
      }
      pending = this.missing(pending, target);
    }
    return { saved, errors };
  }
}
