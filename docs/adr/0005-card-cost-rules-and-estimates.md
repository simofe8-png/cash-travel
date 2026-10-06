# ADR-0005 — Card cost rules, estimates and actual charges

## Status
Accepted (Step 13, 2026-10-06).

## Context
Card purchases and card-funded ATM withdrawals are billed later in the card's billing currency (normally ILS) with
issuer-specific conversion and fees. The spec requires data-driven, versioned rules (no universal hardcoded fee),
honest uncertainty, estimate and actual kept separately, DCC ("charged in another currency") support, and no network
dependency at entry time.

## Evidence
Searched (2026-10-06) for current Isracard / MAX / CAL foreign-transaction fee schedules. Results were partial and
not authoritative for card purchases (one snippet concerned buying currency at a changer, another came from a third-
party prepaid card); the official Isracard tariff PDF reachable was from 2011–2014. Fees vary by card plan. No
issuer default could be verified.

## Decision
- **Rule set** (`src/data/cardRules/bundledRuleSet.ts`, version `2026.10.1`, effective 2026-10-01): per issuer a
  conversion basis (`REFERENCE_RATE` = cached ECB cross rate) and `defaultFeePercent` — **null for every issuer**
  (unverified → unknown). Stored in `card_rule_sets` with version/source/effective date; `validateRuleSet` guards
  activation; the highest valid version effective on the transaction date is used.
- **Controlled update mechanism:** a new rule set ships with an app update and is installed via
  `CardCostService.installRuleSet` (validated, insert-if-new). No remote rule source in V1 → entry never depends on
  the network.
- **One optional classification per card:** `UNKNOWN` (default) | `NO_FOREIGN_FEE` | `FEE_PERCENT:x` (0 < x ≤ 10,
  ≤ 2 dp) taken from the user's own card agreement. Classification beats issuer default.
- **Estimate** (`estimateCardCharge`): basis = DCC charged amount if known, else original amount (ATM: principal +
  local fee); converted with the cached reference quote; × (100 + fee%) / 100; one final rounding.
  `feeStatus`: `INCLUDED` / `NONE` / `UNKNOWN` (unknown fee, unknown DCC markup, or any ATM withdrawal — issuer
  cash-withdrawal fees may apply). No cached rate → `UNAVAILABLE` (never invented). Persisted with rate, source,
  rate date, rule-set version and rule id.
- **Actual charge** is entered later (`setActualCharge`), stored separately, survives edits, never touches cash.
  Reporting prefers actual, then estimate (ADR-0006).
- `FxRateService` orders sources by configured providers but never ignores other cached sources.

## Alternatives considered
- Hardcoding commonly quoted issuer percentages: unverifiable, plan-dependent → would present invented fees as facts.
- Asking card number/BIN to identify plans: violates SECURITY.md (no credentials).

## Consequences
Until the user classifies a card, estimates are explicitly "excluding possible card fees". A future verified rule
set can add issuer defaults without code changes.

## Verification
`src/domain/card/card.test.ts` (estimates incl. fees, DCC, ATM, unavailable; classification parsing; rule-set
validation; guard: no fee literal in engine code — probe verified it fails), `src/application/cards/CardCostService.test.ts`
(bundled rules, controlled update, offline estimate persisted with provenance, DCC, actual vs estimate, ATM,
credential-like input rejected). Expected values computed exactly with BigInt.
