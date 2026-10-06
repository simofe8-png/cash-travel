# ADR-0002 — Money and decimal representation

## Status
Accepted (Step 3, 2026-10-06).

## Context
FINANCIAL_DOMAIN.md forbids floating point as authoritative money, requires integer minor units per
currency exponent, an exact/scaled decimal FX layer, and rounding only at final currency boundaries.

## Decision
- `Money = { minor: number, currency: string }` where `minor` must be a **safe integer** (|x| ≤ 2^53−1, checked
  on every construction/arithmetic). Integer arithmetic within that range is exact; ~9×10^13 major units of
  headroom. Persisted as SQLite `INTEGER`.
- Currency metadata (`src/domain/money/currency.ts`): ISO 4217 exponents (JPY/KRW/VND/ISK 0, JOD 3, others 2),
  symbol, Hebrew name. Unsupported codes are rejected.
- `Decimal = { coef: bigint, scale: number }` for rates, persisted as canonical decimal **TEXT** (e.g. "3.6789").
- Conversion `convertByRatio(amount, numerator, denominator, target)` computes the whole expression in BigInt and
  rounds **once**, half away from zero, at the target minor unit. Cross-rates through a base currency therefore
  carry no intermediate rounding.
- Effective FX rate is a derived display value (`effectiveRate`, 8 dp, half-up); the actual given/received
  amounts remain the authoritative facts.
- Input parsing is strict: never rounds user input (more decimals than the exponent → error); commas forming
  valid 3-digit groups are thousands separators ("7,000" = 7000, Israeli convention); a single comma followed by
  1–2 digits is a decimal comma ("12,5"); any other comma form is rejected; bidi/space characters ignored.
  (Amended in Step 16: the first version read a lone comma as decimal, which rejected "7,000" — found by a UI test.)
- Display formatting is string-based from integers (no `Intl`/float path).

## Alternatives considered
- BigInt for all Money: unnecessary for realistic travel amounts and awkward across React/SQLite boundaries.
- decimal.js / big.js: extra dependency; the needed operations (multiply, divide-with-rounding, compare) are small.

## Consequences
No floating point participates in any authoritative amount. All later engines use these primitives.

## Verification
`src/domain/money/money.test.ts` — 55 deterministic tests (ILS/USD/EUR/THB/JPY/KRW/JOD, parsing edge cases,
half-up negative rounding, cross-rate without intermediate rounding, overflow).
