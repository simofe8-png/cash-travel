# Cash Travel — Master Build Plan — Autonomous Sequential 1→N

## Global execution rule
Execute strictly in numerical order and continue autonomously through the entire plan. For every step: inspect current state → implement only that step's approved scope → run specified verification → fix with at most 5 evidence-based iterations → update `docs/PROJECT_STATE.md` → mark PASS only with evidence → immediately begin the next numbered step.

PASS is a quality gate, not a request-for-user-approval gate. Do not pause between normal steps. Future steps are not authorization to implement them early. Stop only for an exceptional stop condition defined in `CLAUDE.md`.

### 1. Bootstrap & governance
Create/validate Expo TypeScript project structure; install only essential baseline tooling; place/validate authoritative docs; establish lint/typecheck/test commands; establish Git hygiene and environment conventions.
**PASS:** app baseline runs; lint/typecheck/test commands execute; documentation reading order is valid; no product features yet.

### 2. Architecture skeleton
Create domain/application/repository/infrastructure/UI boundaries and dependency direction without implementing financial behavior.
**PASS:** compile/typecheck; dependency boundaries documented; no UI→SQLite direct writes.

### 3. Money & currency foundation
Implement currency metadata/exponents, integer minor-unit Money type, exact/scaled decimal FX representation, parsing/formatting and final-boundary rounding.
**PASS:** deterministic tests including ILS/USD/EUR/THB/JPY and edge cases; no authoritative float money path.

### 4. SQLite foundation & migration framework
Initialize Expo SQLite, migration runner/versioning, FK enforcement, transactional repository primitives and test harness.
**PASS:** clean install + repeat startup + rollback/migration tests.

### 5. Core database schema
Implement schema for trips, categories, payment methods/cards, transactions, ledger entries, FX snapshots, card-rule metadata, receipts and change-history fields as finalized in schema ADR.
**PASS:** migration tests, constraints/FKs/indexes verified; schema ADR written.

### 6. Ledger Engine
Implement atomic parent transaction + ledger entries, balance derivation and invariant checks for approved transaction types.
**PASS:** unit/integration tests prove all-or-nothing writes and balance equation.

### 7. Opening balances & trip lifecycle
Implement trip creation/editing, date semantics, opening-balance transactions, current/completed context and multiple trips.
**PASS:** opening balances are ledger events; trip edits do not silently rewrite financial history.

### 8. Expense Engine
Implement cash vs credit expenses, categories/custom categories, reassignment rules and fast-entry defaults.
**PASS:** cash expense changes wallet; credit expense does not; both count as expense; category integrity tests pass.

### 9. FX Exchange Engine
Implement actual given/received exchange, two-sided ledger entries, effective rate and snapshots.
**PASS:** exchange is atomic, changes both wallets, never counts as expense, precision tests pass.

### 10. ATM Withdrawal Engine
Implement received-cash ledger effect, card-funded semantics, optional local ATM fee model and estimate/actual charge fields.
**PASS:** principal increases cash and is not expense; fee semantics verified; no unrelated cash wallet decremented.

### 11. Cash Adjustment & reconciliation
Implement additional-action reconciliation with signed adjustment and negative-balance support.
**PASS:** no direct balance editing exists; adjustment is auditable ledger event.

### 12. FX reference provider abstraction & offline cache
Define provider interface, cache/provenance model, cross-rate capability, stale/no-rate states. Select provider only with documented evidence and ADR; do not bind domain to vendor schema.
**PASS:** online/cached/no-rate tests; no-rate never blocks original-currency transaction.

### 13. Card Cost Engine & rule model
Implement data-driven issuer/card-plan rules, version/effective/source metadata, estimated charges, DCC alternate charged currency, actual-charge override semantics. Establish controlled update/version mechanism without making core entry network-dependent.
**PASS:** no universal hardcoded fee in business logic; estimate/actual tests; uncertainty represented honestly; ADR written.

### 14. Reporting Engine
Implement cash balances, today/trip totals, total-trip-cost vs during-trip, average/day rules, category totals, cash-vs-credit and reporting-currency conversion.
**PASS:** reporting derived from authoritative data; pre-trip semantics and reporting-currency changes tested; no budget logic.

### 15. App design system & RTL shell
Implement approved visual system, typography, spacing, controls, navigation shell and RTL behavior before full screen wiring.
**PASS:** Android render/navigation smoke test; mixed RTL/LTR/currency behavior reviewed.

### 16. Screen 1 — Trip Setup
Implement create/edit trip, dates, reporting currency default ILS/change support, opening balances and approximate starting equivalent.
**PASS:** validation, persistence and opening-ledger behavior verified.

### 17. Screen 2 — Home
Implement current-trip context, cash wallet cards, opening/current balances, today/trip spending, recent actions, negative-balance warning/quick actions and universal Add CTA.
**PASS:** displayed values come from Reporting/Ledger engines; no duplicate financial calculations in UI.

### 18. Screen 3 — Add Action
Implement adaptive Expense/FX/ATM modes plus Cash Adjustment under additional actions; fast defaults; advanced place/note/receipt entry hooks.
**PASS:** all four flows persist atomically through application/domain layer; normal expense is minimal-tap flow.

### 19. Screen 4 — Journal
Implement newest-first day grouping, expense-only daily totals, search and category/type/payment filters.
**PASS:** filtering/order/date semantics tested; FX/ATM principal excluded from daily expense total.

### 20. Screen 5 — Action Details
Implement adaptive detail views, atomic edits, actual card charge update, receipt controls and soft deletion with change history.
**PASS:** edits leave no stale ledger effects; deleted actions disappear from active balances/reports/journal.

### 21. Screen 6 — Summary
Implement total trip cost, during-trip spending, today, valid average/day, category tiles, cash-vs-credit and category→filtered Journal navigation.
**PASS:** zero-spend categories hidden; no budget/false “money left” calculation; reporting tests match UI.

### 22. Screen 7 — Settings & trip/card configuration
Implement trip edit entry, minimal issuer/card management via sheet/dialog, reporting-currency selection, optional app-lock setting and export entry.
**PASS:** no unnecessary card credentials; no extra top-level screen.

### 23. Receipt camera & private-file lifecycle
Implement camera permission-on-demand, capture/preview/confirm/replace/delete references, app-private storage and safe orphan cleanup strategy.
**PASS:** physical/emulator validation as capability permits; DB/file consistency tests; no OCR/document system.

### 24. Optional device authentication
Implement biometric/device-credential lock using supported platform APIs with safe fallback/disable behavior.
**PASS:** lock lifecycle and recovery behavior tested on supported Android target; no custom PIN.

### 25. Professional PDF trip report
Generate local professional PDF from Reporting Engine data; use Android share/save sheet; exclude receipt images by default.
**PASS:** report figures match engine; share/save works; no direct Drive integration; PDF is clearly report-only.

### 26. Offline & lifecycle hardening
Test/repair app startup without network, process death/restart, cached/no-rate behavior, DB reopening, pending external-data refresh and date/timezone boundaries.
**PASS:** core financial workflow remains usable offline; no original transaction mutates after refresh.

### 27. Security & privacy hardening
Perform mobile security review, permission audit, app-private storage/export checks, logs, Android components/intents, dependencies and temporary files.
**PASS:** documented findings resolved or explicitly accepted; no unnecessary sensitive logging/permissions.

### 28. Migration & data-integrity hardening
Exercise representative schema upgrades, rollback/failure scenarios, integrity checks, soft-delete/change-history and rebuildable derived data.
**PASS:** existing data survives supported upgrades; financial invariants hold after migration.

### 29. Full automated regression gate
Run complete unit/integration/UI/typecheck/lint suite and targeted invariant matrix.
**PASS:** zero unexplained failures; no skipped critical financial tests.

### 30. Android physical-device acceptance QA
Execute end-to-end Hebrew RTL trip: setup, opening wallets, cash expense, credit expense, FX, ATM, negative cash, adjustment, receipt, edit/delete, offline use, reporting-currency change, summary, PDF share, restart and optional lock.
**PASS:** evidence recorded for all acceptance scenarios; defects fixed and reverified within bounded-retry rules.

### 31. Release-readiness audit
Audit scope against Product Spec, security, permissions, dependencies, docs, migrations, versioning, build config and known limitations. Confirm excluded V1 features were not accidentally introduced.
**PASS:** release checklist complete; remaining risks explicitly documented.

### 32. Release candidate build
Produce the Android release candidate and run final smoke/installation/upgrade verification when this can be done locally or with already-authorized, no-new-cost project resources. If signing credentials, a paid/quota-consuming external build, or another unavailable external prerequisite is required, stop only at that exact exceptional gate and preserve all completed work.
**PASS:** reproducible RC build, install/upgrade works, exact source revision recorded. If an exceptional external prerequisite prevents execution, record BLOCKED rather than claiming PASS.

### 33. Final V1 handoff
Update README, architecture/domain/security/testing docs, ADR index, PROJECT_STATE, known limitations and operational instructions. Record exact V1 checkpoint.
**PASS:** a new Claude session can recover the project solely from repository docs and evidence, with no dependence on chat history.

## STEP 34 — Lean Architecture Audit
**Goal:** prove that the completed V1 is intentionally lean, fast, and free of unjustified implementation weight.

**Scope:** review dependencies, architectural layers, runtime services, startup path, critical transaction-save path, SQLite access patterns, dead code, and duplicated utilities.

**Required work:**
- inventory all direct dependencies and justify each one;
- prefer Expo/platform capability over third-party packages where practical;
- remove unused or unjustified dependencies;
- identify unnecessary abstractions/services and simplify only where behavior and correctness are preserved;
- verify transaction save remains offline and does not wait for FX/card-rule network calls;
- verify key Journal/Summary queries do not require loading the complete ledger unnecessarily;
- run regression verification after any simplification.

**PASS:** every retained dependency/layer has a concrete purpose; no known unnecessary runtime service or dependency remains; financial behavior and tests remain unchanged and passing.

## STEP 35 — Final Repository Hygiene & Clean Verification
**Goal:** finish with a clean production repository, not a development workspace full of disposable artifacts.

**Required work:**
1. Inventory files/directories created during implementation.
2. Classify each relevant artifact as REQUIRED or DISPOSABLE using references/imports/scripts/config/build/test/migration/runtime evidence.
3. Remove only proven-disposable artifacts. Never remove unrelated pre-existing/user-owned work.
4. Review and remove dead code and unused dependencies when safely proven unused.
5. Review debug logs, screenshots, dumps, scratch files, temporary scripts, test outputs, generated reports, obsolete builds, caches, abandoned experiments, duplicate assets, backups, and temporary exports.
6. Re-run clean verification after cleanup: install/dependency integrity, typecheck, lint, automated tests, migrations, and required Android build/device checks.
7. Update PROJECT_STATE.md with final evidence.

**PASS:** repository is clean; no known disposable development artifacts remain; all post-cleanup verification passes; final report contains Removed, Retained, Dependencies removed, Final repository status, and Post-cleanup verification.

**Execution rule:** Steps 34 and 35 are normal autonomous steps. Do not stop for approval between them. A deletion becomes a hard stop only if evidence cannot establish that the target is disposable or it may affect user-owned/unrelated data.
