// Live provider contract check (network). Not part of the offline suite: run `npm run test:live`.
import { get } from 'node:https';

import { CurrencyApiProvider } from './CurrencyApiProvider';
import { FrankfurterProvider } from './FrankfurterProvider';
import type { FetchLike } from './http';

// jest-expo replaces global fetch with a mock, so use Node's https directly.
const fetchFn: FetchLike = (url) =>
  new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode ?? 0, json: async () => JSON.parse(body) }));
    }).on('error', reject);
  });

describe('live reference-rate providers', () => {
  it('ECB (Frankfurter) returns validated EUR-based rates', async () => {
    const rates = await new FrankfurterProvider(fetchFn).fetchRates('2026-09-28', '2026-10-02', ['ILS', 'THB', 'USD', 'JPY']);
    expect(rates.length).toBe(20);
    expect(rates.every((r) => r.source === 'ECB' && Number(r.rate) > 0)).toBe(true);
  }, 30000);

  it('secondary returns currencies ECB lacks', async () => {
    const rates = await new CurrencyApiProvider(fetchFn).fetchRates('2026-10-03', '2026-10-03', ['VND', 'GEL', 'AED', 'JOD', 'EGP', 'MAD']);
    expect(rates.map((r) => r.quote).sort()).toEqual(['AED', 'EGP', 'GEL', 'JOD', 'MAD', 'VND']);
  }, 30000);
});
