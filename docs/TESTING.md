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

## V1 suites (where to look)
Domain engines `src/domain/**/*.test.ts`; SQLite repositories, migrations and upgrades `src/data/**/*.test.ts` (incl. `upgrade.test.ts`); use cases and offline/lifecycle `src/application/**/*.test.ts`; regression matrix `src/regression.test.ts`; architecture guards `src/architecture.test.ts`; UI/navigation `src/ui/**/*.test.tsx` (React Native Testing Library over Expo Router); trip documents `src/domain/document`, `src/application/documents`, `src/data/db/tripDocumentsMigration.test.ts`, `src/ui/viewer/zoom.test.ts`, `src/ui/screens/DocumentsScreen.test.tsx` (gesture/animation libraries are mocked in `jest.setup.js`; zoom geometry is tested as pure functions); live FX contract `*.live.test.ts` (`npm run test:live`, excluded from CI). Device QA evidence is recorded per step in `docs/PROJECT_STATE.md`.
