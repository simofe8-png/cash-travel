# ADR-0004 — FX reference-rate providers, offline cache and historical-rate policy

## Status
Accepted (Step 12, 2026-10-06).

## Context
Reference (market) rates are needed for reporting-currency equivalents and card-charge estimates.
They must never block offline transaction entry, never be invented, carry provenance, and the domain
must not depend on a vendor schema. V1 has no backend and no API keys.

## Evidence (probed 2026-10-06 from the dev machine)
| Candidate | Result |
| --- | --- |
| Frankfurter `api.frankfurter.dev/v1` (ECB reference rates) | Keyless HTTPS, HTTP 200 in ~0.46 s; 29 currencies + EUR; historical by date (Sat 2026-10-03 → returns Fri 2026-10-02 rates); date-range time series in one request. No VND/GEL/AED/JOD/EGP/MAD (VND → HTTP 404). |
| fawazahmed0 `currency-api` via jsDelivr (+ pages.dev mirror) | Keyless HTTPS; daily dated snapshots (339 codes) including all six ECB gaps; community-aggregated, weaker provenance. |

## Decision
- **Primary: ECB via Frankfurter** (`source = 'ECB'`). **Secondary: currency-api** (`source = 'CURRENCY_API'`), used
  only for (date, currency) needs the primary could not satisfy. Every cached rate and every quote keeps its source.
- Port `FxRateProvider.fetchRates(from, to, currencies)` returns EUR-pivot `ReferenceRate`s. Adapters live in
  `src/infrastructure/fx/`, validate responses strictly (base, ISO dates, plain positive decimals; malformed → reject;
  non-HTTPS refused; 10 s timeout), and send nothing but the URL (no user data).
- Cache table `fx_rates` (source, base EUR, quote, rate TEXT, rate_date, fetched_at), UNIQUE per source/pair/date;
  a published rate is immutable (re-fetch never overwrites).
- **Historical-rate policy:** the reference rate for local date D is the most recent publication dated in
  [D − 7 days, D] — weekends/holidays use the prior business day. Both legs of a cross-rate must come from the same
  source and publication date; ECB preferred. Age > 3 days is flagged `stale`; nothing older than 7 days and nothing
  published after D is ever used → **UNAVAILABLE** (never extrapolated or invented).
- Conversion is exact: amount × (EUR→to) / (EUR→from) in one BigInt expression, rounded once (ADR-0002).
- `FxRateService.quote/convert` are synchronous cache reads (no network). `refresh(needs, target)` is the only
  networked call: one ranged primary request covering [min(D) − 7, max(D)], then secondary per missing date; never
  throws (errors returned), skips future dates, never touches financial tables.

## Alternatives considered
- Single source ECB only: leaves popular destinations (Vietnam, Georgia, UAE, Jordan, Egypt, Morocco) permanently
  without reporting equivalents.
- Keyed commercial APIs: require secrets/accounts (not allowed in V1) and possibly cost.
- Storing a reporting equivalent on each transaction: would freeze a reporting currency into financial records;
  equivalents are derived from the provenance-tracked cache instead.

## Consequences
- Rates are reference values; actual cash exchanges always use the user's actual amounts.
- Reporting for a transaction stays "unavailable" until a qualifying rate is cached.

## Verification
`src/domain/fx/reference.test.ts` (policy), `src/infrastructure/fx/providers.test.ts` (canned/malformed/HTTP/timeout),
`src/application/fx/FxRateService.test.ts` (offline-first, ranged refresh, secondary fill, failure tolerance, cache
immutability, no-rate never blocks a transaction and refresh never mutates it). Live contract: `npm run test:live`
→ 2/2 against the real endpoints (2026-10-06).
