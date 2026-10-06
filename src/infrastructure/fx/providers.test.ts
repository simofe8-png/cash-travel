import { CurrencyApiProvider } from './CurrencyApiProvider';
import { FrankfurterProvider } from './FrankfurterProvider';
import { getJson, ProviderError, toRateString, type FetchLike } from './http';

function fakeFetch(routes: Record<string, unknown | number>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const F = 'https://api.frankfurter.dev/v1';

describe('FrankfurterProvider (ECB)', () => {
  it('parses a time series for requested currencies only', async () => {
    const f = fakeFetch({
      [`${F}/2026-09-28..2026-10-02?base=EUR`]: {
        amount: 1,
        base: 'EUR',
        start_date: '2026-09-28',
        end_date: '2026-10-02',
        rates: { '2026-09-28': { ILS: 3.4854, THB: 38.196, USD: 1.1 }, '2026-10-02': { ILS: 3.4408, THB: 37.71 } },
      },
    });
    const rates = await new FrankfurterProvider(f).fetchRates('2026-09-28', '2026-10-02', ['ILS', 'THB', 'EUR']);
    expect(rates).toEqual([
      { source: 'ECB', quote: 'ILS', rate: '3.4854', rateDate: '2026-09-28' },
      { source: 'ECB', quote: 'THB', rate: '38.196', rateDate: '2026-09-28' },
      { source: 'ECB', quote: 'ILS', rate: '3.4408', rateDate: '2026-10-02' },
      { source: 'ECB', quote: 'THB', rate: '37.71', rateDate: '2026-10-02' },
    ]);
  });

  it('parses a single date (weekend → prior publication date as returned)', async () => {
    const f = fakeFetch({ [`${F}/2026-10-03?base=EUR`]: { amount: 1, base: 'EUR', date: '2026-10-02', rates: { ILS: 3.4408 } } });
    expect(await new FrankfurterProvider(f).fetchRates('2026-10-03', '2026-10-03', ['ILS'])).toEqual([
      { source: 'ECB', quote: 'ILS', rate: '3.4408', rateDate: '2026-10-02' },
    ]);
  });

  it('rejects malformed responses and HTTP errors', async () => {
    const p = (body: unknown) => new FrankfurterProvider(fakeFetch({ [`${F}/2026-10-03?base=EUR`]: body })).fetchRates('2026-10-03', '2026-10-03', ['ILS']);
    await expect(p({ base: 'USD', date: '2026-10-02', rates: { ILS: 1 } })).rejects.toThrow(ProviderError);
    await expect(p({ base: 'EUR', date: 'yesterday', rates: { ILS: 1 } })).rejects.toThrow(ProviderError);
    await expect(p({ base: 'EUR', rates: 'nope' })).rejects.toThrow(ProviderError);
    await expect(p(500)).rejects.toThrow('HTTP 500');
  });

  it('drops invalid individual rates instead of storing them', async () => {
    const f = fakeFetch({ [`${F}/2026-10-03?base=EUR`]: { base: 'EUR', date: '2026-10-02', rates: { ILS: -1, THB: 'x', USD: 1e-9, JPY: 176.99 } } });
    expect((await new FrankfurterProvider(f).fetchRates('2026-10-03', '2026-10-03', ['ILS', 'THB', 'USD', 'JPY'])).map((r) => r.quote)).toEqual(['JPY']);
  });

  it('makes no request when only EUR is needed', async () => {
    const f = fakeFetch({});
    expect(await new FrankfurterProvider(f).fetchRates('2026-10-03', '2026-10-03', ['EUR'])).toEqual([]);
    expect(f.calls).toEqual([]);
  });
});

describe('CurrencyApiProvider (secondary)', () => {
  const url = (d: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/eur.json`;

  it('fetches one snapshot per day and maps lowercase keys', async () => {
    const f = fakeFetch({
      [url('2026-10-03')]: { date: '2026-10-03', eur: { vnd: 29261.61768248, ils: 3.43520952, btc: 1e-5 } },
      [url('2026-10-04')]: { date: '2026-10-04', eur: { vnd: 29300.5, ils: 3.44 } },
    });
    const rates = await new CurrencyApiProvider(f).fetchRates('2026-10-03', '2026-10-04', ['VND', 'ILS']);
    expect(rates).toEqual([
      { source: 'CURRENCY_API', quote: 'VND', rate: '29261.61768248', rateDate: '2026-10-03' },
      { source: 'CURRENCY_API', quote: 'ILS', rate: '3.43520952', rateDate: '2026-10-03' },
      { source: 'CURRENCY_API', quote: 'VND', rate: '29300.5', rateDate: '2026-10-04' },
      { source: 'CURRENCY_API', quote: 'ILS', rate: '3.44', rateDate: '2026-10-04' },
    ]);
  });

  it('tolerates a missing day but fails when nothing was retrieved', async () => {
    const f = fakeFetch({ [url('2026-10-04')]: { date: '2026-10-04', eur: { vnd: 29300.5 } } });
    expect(await new CurrencyApiProvider(f).fetchRates('2026-10-03', '2026-10-04', ['VND'])).toHaveLength(1);
    await expect(new CurrencyApiProvider(fakeFetch({})).fetchRates('2026-10-03', '2026-10-03', ['VND'])).rejects.toThrow(ProviderError);
  });
});

describe('http helpers', () => {
  it('only allows HTTPS', async () => {
    await expect(getJson(fakeFetch({}), 'http://example.com')).rejects.toThrow('HTTPS');
  });

  it('times out', async () => {
    const hang: FetchLike = (_u, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(getJson(hang, 'https://x.test', 10)).rejects.toThrow(ProviderError);
  });

  it.each([
    [3.431, '3.431'],
    [29261.61768248, '29261.61768248'],
    [1e-7, null],
    [0, null],
    [-2, null],
    [Number.NaN, null],
    ['3.4', null],
  ])('toRateString(%p) → %p', (input, out) => {
    expect(toRateString(input)).toBe(out);
  });
});
