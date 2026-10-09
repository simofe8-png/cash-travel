# Architecture Specification

## Stack
React Native + Expo + TypeScript; Android-first; future iOS-compatible structure. Expo SQLite is the authoritative local DB. Use migrations from day one.

## Layering
- UI/screens: render state and capture user intent; no arbitrary DB writes or financial calculations.
- Application/use-cases: orchestrate user actions and transactions.
- Domain: Money, Ledger, Expense, FX, Card Cost, Reporting rules.
- Repositories: persistence contracts and SQLite implementations.
- Infrastructure/adapters: SQLite, FX provider, card-rule update source, camera/private files, PDF/share, device authentication.

## Engines
**Ledger Engine:** sole component allowed to create financial effects and derive balances.
**Expense Engine:** expense semantics/categories/payment classification.
**FX Engine:** reference rates, actual exchange, cross-rates, historical snapshots/reporting equivalents.
**Card Cost Engine:** issuer/card rules, fee/FX route, estimate/actual semantics.
**Reporting Engine:** Home/Summary/category/daily/payment aggregates. Never duplicate calculations in screens.

## Database design requirements
Use normalized entities for trips, wallets/currencies where needed, transactions, ledger entries, categories, payment methods/cards, FX snapshots, card-rule metadata, receipt references, and change/audit metadata as justified by implementation. Exact schema is finalized during the dedicated build-plan schema step and documented in an ADR.

Use foreign keys, appropriate uniqueness/check constraints, indexes for Journal/reporting queries, and atomic SQLite transactions. Schema evolution is migration-only. Do not assume fresh installs.

## External provider abstraction
Domain must not depend on a vendor response schema. FX and card-rule sources use interfaces/adapters and persist relevant source/version/effective-date metadata. Network failure degrades gracefully; core transaction entry remains offline.

## Offline model
All core user actions operate locally. Network is an enhancement for reference rates/rule updates, not a prerequisite for financial entry. Cache externally sourced reference data with provenance/timestamps.

## Files
Receipt photos and trip documents live in app-private storage and are referenced by the DB (ADR-0008, ADR-0013). PDF export is generated locally and leaves private storage only through explicit Android share/save action.

## State
UI state may cache derived data for responsiveness, but caches are rebuildable and never authoritative. Ledger/database remain source of truth.

## RTL and locale
RTL is designed from first implementation. Mixed Hebrew/Latin, currency symbols, numbers, dates, icons, back navigation and inputs must be verified. Time persistence uses a consistent canonical representation; trip date-only boundaries are handled deterministically.

## V1 implementation map
- Layers (ADR-0001, lint-enforced): `src/domain` (pure engines: money, ledger rules, FX, ATM, card cost, reporting, trip/time) ← `src/application` (use-case services + ports) ← `src/data` (SQLite repositories, migrations) / `src/infrastructure` (Expo adapters: SQLite, FX HTTP providers, receipt files/camera, device auth, PDF) ← `src/composition` (`createServices`, app container, DB open/upgrade). `src/ui` + `src/app` (Expo Router routes) call application services only.
- Ledger: `SqliteLedgerRepository` is the sole writer of financial tables (architecture test); balances are derived by SQL from active entries.
- Schema/migrations: ADR-0003 (incl. pre-upgrade snapshot, table-rebuild support, integrity check). FX: ADR-0004. Card cost: ADR-0005. Reporting: ADR-0006. UI shell/RTL: ADR-0007; visual system: ADR-0010. Receipts: ADR-0008. PDF: ADR-0009. Trip documents (incl. the local native module `modules/document-render`): ADR-0013.
- Network is used only for background reference-rate refresh (`useRateRefresh`), never on a save path.
