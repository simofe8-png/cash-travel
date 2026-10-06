# Financial Domain Specification

## Core separation
Never conflate:
1. **Cash** — physical wallet balances by currency.
2. **Expenses** — trip spending, cash or credit.
3. **Cards** — payment instruments/charges, not cash wallets.
4. **Reporting currency** — presentation/reporting unit only.

## Source of truth
Transaction Ledger is the sole authoritative source of financial state. Current cash balance is derived, never independently edited.

## Transaction types
- `OPENING_BALANCE`
- `EXPENSE`
- `FX_EXCHANGE`
- `ATM_WITHDRAWAL`
- `CASH_ADJUSTMENT`

No generic INCOME and no REFUND in V1.

## Parent + entries
A user action is a parent Transaction; its financial effects are Ledger Entries. Persist parent and all entries atomically.

Examples:
- Opening THB 7,000 → THB CASH +7000.
- Cash expense THB 850 → EXPENSE + THB CASH -850.
- Credit expense THB 5,000 → EXPENSE, no cash decrement.
- USD 1,000 → THB 32,000 → FX_EXCHANGE + USD CASH -1000 + THB CASH +32000.
- ATM receive THB 40,000 → ATM_WITHDRAWAL + THB CASH +40000.
- Reconciliation -THB 300 → CASH_ADJUSTMENT + THB CASH -300.

## Cash balance equation
For a wallet/currency, active balance = sum of active cash ledger entries for that wallet/currency. Soft-deleted transactions contribute zero.

## Money representation
No authoritative float/double. Store money in integer minor units according to currency exponent. Central Money layer owns parsing, arithmetic, formatting, exponents and rounding. FX rates use exact Decimal/scaled representation with sufficient precision. Round only at required final currency boundaries.

## FX concepts
Keep separate:
- Market/reference rate: estimates/reporting.
- Actual cash exchange rate: derived from actual given/received.
- Card rate/rules: issuer/card-specific route and fees.

Persist rate snapshot metadata when used: rate, source/type, timestamp, effective/reference date where applicable. Historical original amounts never change due to later rates.

## Offline missing-rate behavior
Never block valid transaction entry because a reporting FX rate is unavailable. Save original transaction and original-currency ledger effects. Reporting equivalent is “unavailable” until a valid rate can be resolved under the approved historical-rate policy. Never invent a rate.

## Card-cost semantics
Rules are data-driven and versioned; never hardcode a universal issuer fee in business logic. Preserve estimate and actual charge separately. Reporting prefers actual when known. Unknown/uncertain calculations are labeled estimated.

## Dates
Every transaction has `occurred_at` and `created_at`. Journal/reporting chronology uses `occurred_at`. A transaction may belong to a trip outside its travel date range.

Total Trip Cost includes all trip expenses regardless of date. “During Trip” includes only expenses with `occurred_at` inside trip boundaries. Prepaid expenses do not extend trip day count.

## Edits and deletion
Financial edits are atomic and preserve change history. Delete is soft delete. Deleted transactions immediately stop affecting balances, Journal, Summary and reporting. Do not expose reversal complexity to the user unless later required.

## Invariants
- Credit expense never reduces physical cash.
- ATM principal never counts as expense.
- FX principal never counts as expense.
- Failed multi-entry transaction has zero financial effect.
- Reporting-currency change never mutates original financial records.
- Soft-deleted transaction contributes zero to active financial state/reporting.
- Current cash is derivable from active ledger entries at all times.

## Implementation notes (Step 7)
- Every transaction stores `occurred_at` (UTC instant) plus `occurred_local_date` and the device UTC offset at entry; day grouping and "today" use local dates, so a later timezone change never regroups history.
- Trip boundaries are inclusive date-only values. Status: UPCOMING (today < start), CURRENT, COMPLETED (today > end). Trip day count = inclusive days between start and end; pre/post-trip expenses never extend it.
- Opening balances are `OPENING_BALANCE` ledger transactions (at most one active per currency per trip), timestamped when entered. Changing them revises/soft-deletes/records ledger transactions with history. Editing trip name/dates/reporting currency never modifies any transaction.
