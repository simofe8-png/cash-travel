# ADR-0006 — Reporting semantics

## Status
Accepted (Step 14, 2026-10-06).

## Context
Home, Summary and the PDF must show the same numbers, computed once, from authoritative ledger data, in a
changeable reporting currency, without budget logic and without hiding what could not be converted.

## Decision
- **Trip cost items** = active `EXPENSE` transactions + **local ATM fees** (a real cost charged to the card, see
  ADR on ATM in FINANCIAL_DOMAIN). FX principal, ATM principal, opening balances and cash adjustments are never
  spending. Soft-deleted transactions contribute nothing.
- **Value of an item in the reporting currency** (at the item's local date, ADR-0004 rate policy):
  cash expense / ATM fee → reference conversion (EXACT if same currency);
  card expense → actual charge (CARD_ACTUAL) → stored estimate (CARD_ESTIMATE) → estimate re-derived from the
  current cache (not persisted; records never mutate) → reference conversion of the original.
- **Totals** carry `count`, `estimatedCount`, `unavailableCount` and the original-currency sums of unconvertible
  items, so the UI can say "₪657 + 1 item without a rate (₫1,000,000)". Nothing is silently dropped or invented.
- **Total trip cost** = all items regardless of date (prepaid + post-trip). **During trip** = item date within
  [start, end]. Also pre-trip, post-trip and **today** (device-local date).
- **Average per day** = during-trip total ÷ elapsed trip days (start … min(today, end)); null before the trip
  starts; flagged `partial` when some during-trip item has no rate. Prepaid items never extend the day count.
- **Categories**: expense categories only, zero-spend hidden, largest first; a category whose items all lack rates
  stays visible as unavailable. ATM fees are a separate "ATM fees" figure (not a category).
- **Cash vs credit**: cash expenses vs card expenses; ATM fees reported separately.
- **Journal daily totals** count `EXPENSE` only (PRODUCT_SPEC), so they exclude ATM fees by definition.
- **Wallets**: opening (Σ active opening entries) and current (Σ active entries) per currency, negatives flagged,
  current also shown at today's reference rate when available.
- No budget, "remaining" or "money left" concept exists anywhere.
- Queries aggregate in SQL (cash expenses grouped by date/currency/category, ATM fees by date/currency, card
  expenses per transaction) — the ledger is never loaded wholesale for reporting.

## Consequences
Changing the reporting currency only re-presents figures (verified: transactions, entries and card charges are
byte-identical before/after).

## Verification
`src/application/reporting/ReportingService.test.ts` — full scenario with hand-checkable rates.
