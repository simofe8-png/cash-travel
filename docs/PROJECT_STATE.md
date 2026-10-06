# Cash Travel — Project State — Execution Checkpoint

## Execution mode
AUTONOMOUS END-TO-END.

PASS is an internal quality gate. Claude does not ask the user for permission between normal Master Build Plan steps. After a verified PASS, Claude updates this file and immediately continues to the next numbered step.

## Current status
Implementation in progress.

## Authoritative next step
`docs/MASTER_BUILD_PLAN.md` — Step 17: Screen 2 — Home.

## Last completed build step
Step 16 — Screen 1 — Trip Setup — PASS.

## Exceptional stop conditions
Stop only when proceeding requires an exceptional gate defined in `CLAUDE.md`: unavailable credentials/secrets/human verification; a new paid action; destructive or irreversible data loss/external action; production/store publication; material scope/security/architecture change outside the approved baseline; or an unresolved blocker after the bounded five-iteration process.

## Update protocol
After every step, update this file with: last PASS step, evidence/commands actually run, important files/migrations, significant decisions/ADRs, unresolved risks, next step, Git/build checkpoint. Never mark a step PASS without evidence.

## Step log

### Step 1 — Bootstrap & governance — PASS (2026-10-06)
- Implemented: Expo SDK 57 blank-TypeScript scaffold (RN 0.86.3, React 19.2.3, TS 6.0); Jest (`jest-expo`), ESLint (`eslint-config-expo`, `no-console` error), strict tsconfig; scripts `lint`, `typecheck`, `test`, `verify`; Git repo (`main`, LF via `.gitattributes`); `docs/ENVIRONMENT.md`.
- Evidence: `npm run lint` → 0 problems; `npm run typecheck` → clean; `npm test` → 1/1 pass. Baseline app bundled by Metro (708 modules) and rendered on the physical Galaxy A54 (Android 16) in Expo Go 57.0.9 — screenshot inspected (static template screen). Verification level: automated + physical device (Expo Go).
- Decisions: template LICENSE/AGENTS.md/.claude not imported (CLAUDE.md governs). Native builds require an ASCII-path copy (documented in ENVIRONMENT.md, proven on this machine by a sibling project).
- Risks: low free disk (~7.5 GB) for the later native release build.

### Step 2 — Architecture skeleton — PASS (2026-10-06)
- Implemented: src/{domain,application(+ports),data,infrastructure,ui,composition}; synchronous `SqlDatabase` port; ESLint layer-boundary rules; ADR-0001.
- Evidence: violation probes (domain→react, domain→data, ui→infrastructure, ui→expo-sqlite) produced 4 `no-restricted-imports` errors; probes deleted; `npm run lint` clean; `npm run typecheck` clean. Verification level: static/automated.
- Decision: node:sqlite for tests (zero added deps), sync SQL port (ADR-0001).

### Step 3 — Money & currency foundation — PASS (2026-10-06)
- Implemented: src/domain/money/{currency,decimal,money}.ts — 36 ISO-4217 currencies with Hebrew names; safe-integer minor-unit Money; BigInt Decimal; strict parser; exact string formatting; single-rounding (half away from zero) conversion incl. cross-rate ratio; derived effective rate. ADR-0002.
- Evidence: `npm run verify` → lint clean, typecheck clean, 55/55 tests (ILS/USD/EUR/THB/JPY/KRW/JOD). grep for parseFloat/toFixed/Math.round in src/domain → none. Verification level: automated.

### Step 4 — SQLite foundation & migration framework — PASS (2026-10-06)
- Implemented: expo-sqlite (~57.0.3, config plugin) adapter `src/infrastructure/sqlite/ExpoSqliteDatabase.ts`; test adapter `src/testing/NodeSqliteDatabase.ts` (node:sqlite); `src/data/db/transaction.ts` (BEGIN IMMEDIATE/COMMIT, nested savepoints, rejects async callbacks); `src/data/db/migrate.ts` (ordered 1..N, one atomic transaction per migration incl. PRAGMA user_version + schema_migrations row, downgrade refusal, FK on + foreign_key_check); composition `openAppDatabase()` (WAL).
- Evidence: `npm run verify` → 67/67 tests incl. 12 SQLite integration tests: clean install, repeat startup on a reopened file DB, upgrade from earlier schema with data preserved, failing migration fully rolled back then fixed upgrade succeeds, downgrade refused, FK enforced, all-or-nothing transaction rollback (FK failure and thrown error), nested savepoints. Physical device (A54, Expo Go): two cold starts show `db ok: schema 0->0, fk=1`.
- Decision: Metro must not run with CI=1 during device work (disables file watching → stale bundle).

### Step 5 — Core database schema — PASS (2026-10-06)
- Implemented: migration 0001 `core_schema` (13 STRICT tables, indexes, integrity triggers, built-in category seed). ADR-0003.
- Evidence: `npm run verify` → 79/79 tests (12 schema tests). Device (Expo Go, A54): DB at schema 1 with fk=1 across two cold starts.

### Step 6 — Ledger Engine — PASS (2026-10-06)
- Implemented: src/domain/ledger (types, validateDraft, cashEffects, isExpense); LedgerRepository port; SqliteLedgerRepository (atomic record/revise/softDelete/setActualCharge, derived balances, revisioned immutable entries, history snapshots, actual charge preserved across edits, integrity audit); architecture guard test (sole writer of financial tables; no stored balance).
- Evidence: `npm run verify` → 115/115. Includes the full FINANCIAL_DOMAIN worked example, negative cash, injected failures (CHECK after entries written, 2nd FX leg I/O failure, history write failure) leaving zero effect, edits/soft delete/history, 5×60-step randomized model check of the balance equation, tamper detection. Guard probe: a file with `UPDATE ledger_entries` made the guard fail; removed.
- Correction: the guard regex initially lost its backslashes (template literal) and passed vacuously — found by the probe, fixed with String.raw.

### Step 7 — Opening balances & trip lifecycle — PASS (2026-10-06)
- Implemented: src/domain/time (local-date/occurrence helpers), src/domain/trip (validation, status, day count/number, elapsed days, default trip choice); ports Clock, UnitOfWork, TripRepository; SqliteTripRepository, SqliteUnitOfWork; TripService (createTrip atomic with openings, updateTripDetails, setOpeningBalances via ledger revisions, list/get/current/select).
- Evidence: `npm run verify` → 134/134. Trip creation atomic incl. injected mid-write failure; detail edits leave transactions & ledger entries byte-identical; opening balance changes produce EDIT/DELETE/CREATE history; current/upcoming/completed + selection + fallback; device-offset date boundary.

### Step 8 — Expense Engine — PASS (2026-10-06)
- Implemented: src/domain/expense (built-in keys, custom-category validation, icon set); ports CategoryRepository, CardRepository (no credential fields); SqliteCategoryRepository, SqliteCardRepository (archive-only); ExpenseService (add/edit, reference checks incl. archived category/card rules, per-trip fast-entry defaults); CategoryService (custom create/rename, delete with reassignment to Other or chosen category through Ledger revisions, atomic).
- Evidence: `npm run verify` → 150/150. Cash expense −wallet; credit expense no cash effect; both isExpense; negative wallet allowed; defaults remembered per trip; reassignment audited (EDIT history), no cash effect, atomic under injected failure.
- Decision: custom categories are global (shared across trips); a deleted custom category is archived so historical/soft-deleted references stay valid.

### Step 9 — FX Exchange Engine — PASS (2026-10-06)
- Implemented: src/domain/fx/exchange.ts (exchangeRateView: both directions, 8 dp, natural ≥1 display direction); FxExchangeService (exchange/editExchange via Ledger).
- Evidence: `npm run verify` → 159/159. Both wallets change atomically (2nd-leg injected failure → no change); received wallet auto-created; never isExpense; same-currency/zero/unsupported rejected; edit replaces both legs; precision across exponents (ILS/JPY/JOD/IDR).
- Decision: the actual given/received amounts are the persisted snapshot of an exchange; the effective rate is derived on read (no redundant stored rate). Reference-rate snapshots belong to Step 12.

### Step 10 — ATM Withdrawal Engine — PASS (2026-10-06)
- Implemented: src/domain/atm (atmCardDebit = principal + fee, atmFeeCost = fee only); AtmService (withdraw/editWithdrawal); every ATM withdrawal is card-funded (card optional/unspecified) and carries a card_charges row with the known local-currency debit; estimate UNAVAILABLE until the Card Cost Engine (Step 13); actual entered via setActualCharge.
- Evidence: `npm run verify` → 166/166. Principal +only its wallet (USD/ILS untouched), not isExpense, fee never touches cash, debit = principal+fee, zero fee normalized to none, actual separate and cash-neutral, edit preserves actual, invalid fee currency/amount/card rejected, soft delete removes cash.
- Decision: the local ATM fee is a trip cost (reported separately as ATM fees; reporting ADR at Step 14), never an EXPENSE transaction and never a cash effect.

### Step 11 — Cash Adjustment & reconciliation — PASS (2026-10-06)
- Implemented: ReconciliationService — adjust (signed delta), editAdjustment, difference, reconcile (counted cash → derived delta; no-op when equal).
- Evidence: `npm run verify` → 173/173. Adjustments are CASH_ADJUSTMENT ledger events with CREATE history, not expenses; reconcile fixes negative wallet to counted 0; found cash in new currency; edit/soft delete restore derived balance; repository scan finds no setBalance/updateBalance-style API; no balance column (architecture guard).

### Step 12 — FX reference provider abstraction & offline cache — PASS (2026-10-06)
- Implemented: domain fx/reference (EUR pivot, window policy, resolveQuote, convertWithQuote); ports FxRateProvider, FxRateRepository; SqliteFxRateRepository; infrastructure FrankfurterProvider (ECB, primary), CurrencyApiProvider (secondary), http helpers; FxRateService (sync quote/convert, async tolerant refresh). ADR-0004.
- Evidence: `npm run verify` → 205/205 (offline). `npm run test:live` → 2/2 against real Frankfurter + currency-api endpoints.
- Corrections: two expected values in my tests were hand-miscalculated (code correct; re-derived 7725.02); jest-expo mocks global fetch → live test uses node:https.

### Step 13 — Card Cost Engine & rule model — PASS (2026-10-06)
- Implemented: src/domain/card (rule-set model/validation, classifications, version compare, estimateCardCharge); bundled rule set 2026.10.1 (issuer fees null = unverified); CardRuleRepository + SqliteCardRuleRepository; CardService (validated card management); CardCostService (install/validate rules, offline estimate); ExpenseService (card estimate + DCC `chargedIn`) and AtmService (estimate of principal+fee) integrated. ADR-0005.
- Evidence: `npm run verify` → 228/228. Hardcoded-fee guard probe failed as expected, then restored.
- Fix found by tests: FxRateService ignored cached rates from sources not configured as providers → now preference-ordered but inclusive.
- Corrections: several hand-computed expectations replaced by exact BigInt-derived values.
- Risk: no verified issuer fee defaults; documented; users can classify cards.

### Step 14 — Reporting Engine — PASS (2026-10-06)
- Implemented: src/domain/reporting (CostItem/Total/TripSpending, summarizeSpending, exact average); ReportingQueries port + SqliteReportingQueries (SQL-aggregated cost rows, activity currencies); ReportingService (spending, wallets, approximateEquivalent, rateNeeds). ADR-0006.
- Evidence: `npm run verify` → 239/239. Scenario covers pre/during/post-trip, today, average/day (partial), categories (zero hidden, unavailable visible), cash vs card, actual>estimate, derived estimate after late rates without mutation, reporting-currency change with byte-identical financial tables, wallet negatives, no budget fields.

### Step 15 — App design system & RTL shell — PASS (2026-10-06)
- Implemented: Expo Router shell (src/app), tokens + components, Hebrew strings, LTR-isolated money/date formatting, AppProvider/useQuery, shared composition `createServices` (app + tests), device container, startup error screen, placeholder screens. ADR-0007.
- Evidence: `npm run verify` → 247/247 (incl. 8 navigation tests). `npx expo-doctor` 21/21. Physical A54 / Expo Go: redirect to Trip Setup and RTL rendering inspected via screenshot (before fix: LTR because Expo Go isRTL=false; after root direction: correct RTL).
- Issues fixed: react-dom 19.3 peer conflict (overrides pin), missing expo-asset/expo-font native peers, RNTL 14 async render vs renderRouter, intermittent cold-render timeout.
- Note: the tab bar itself is verified by automated test here; on-device tab verification happens in Step 16 once a trip can be created through the real UI.

### Step 16 — Screen 1: Trip Setup — PASS (2026-10-06)
- Implemented: TripSetupScreen (create/edit via `?tripId=`, name, RTL calendar date fields, reporting currency picker default ILS, opening-balance rows with per-row validation, approximate starting equivalent with honest "no rate yet"), pickers (CurrencyPicker, CurrencyButton, AmountInput, CalendarSheet, DateField), useRateRefresh (background, never on save path), TripService.updateTrip (atomic details + openings).
- Evidence: `npm run verify` → 255/255 incl. 4 Trip Setup UI tests (create → ledger opening balance; validation saves nothing; no-rate message; edit = audited EDIT revision). Physical A54 (Expo Go): created "Thailand" with 7,000 THB + 300 USD through the UI; live ECB refresh produced ≈ ₪1,554.87 (hand-checked: 636.18 + 918.69); app moved to the tab shell, tab order RTL.
- Fixes found: parser read "7,000" as a decimal (ADR-0002 amended: 3-digit comma groups are thousands); footer and tab bar overlapped Android navigation (bottom insets); date fields wrapped (compact month names).
