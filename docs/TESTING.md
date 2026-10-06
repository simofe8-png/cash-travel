# Testing & Verification Strategy

## Rule
Financial invariants require deterministic automated tests. UI screenshots alone never prove financial correctness.

## Test pyramid
1. Domain unit tests: Money, rounding, Ledger, Expense, FX, Card Cost, Reporting.
2. Repository/SQLite integration tests: migrations, atomic writes, queries, soft deletion, upgrade paths.
3. Application/use-case tests: complete financial actions and edits.
4. UI/component/navigation tests for critical flows and RTL.
5. Android emulator/device QA at designated milestones.

## Mandatory financial cases
Opening balances; cash expense; credit expense; FX exchange; ATM withdrawal; cash adjustment; negative cash; edits; soft delete; multi-currency; precision/rounding; reporting-currency changes; pre/during/post-trip expenses; category totals; cash-vs-credit; missing/stale FX rates; estimate vs actual card charge; atomic rollback.

## Migration testing
Test clean install plus upgrade from representative earlier schema states. Migration failure must not silently destroy user data.

## Offline testing
Verify cold/offline app use, transaction entry without network, cached-rate behavior, no-rate behavior, restart persistence, and later rate/rule refresh without mutation of original amounts.

## Physical Android QA gates
At designated milestones verify RTL, keyboard/input, navigation, camera receipt flow, SQLite persistence, process restart, offline mode, PDF share/save, optional biometric/device lock, permissions, lifecycle, and upgrade/migration behavior.

## PASS standard
A step is PASS only when its specified checks actually ran successfully. Report exact verification level: static, automated, emulator, physical device, release.
