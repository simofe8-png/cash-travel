# Cash Travel — Project State — Execution Checkpoint

## Execution mode
AUTONOMOUS END-TO-END.

PASS is an internal quality gate. Claude does not ask the user for permission between normal Master Build Plan steps. After a verified PASS, Claude updates this file and immediately continues to the next numbered step.

## Current status
**V1 COMPLETE** — all Master Build Plan steps 1–35 PASS (incl. governance reconciliation). Checkpoint: tag `v1.0.0` (`a368089`), published to GitHub. Owner-only items listed below.

## Authoritative next step
None — the Master Build Plan is complete. Future work requires a new product decision (`docs/ROADMAP.md`).

## Last completed build step
Step 35 — Final Repository Hygiene & Clean Verification — PASS.

## Exceptional stop conditions
Stop only when proceeding requires an exceptional gate defined in `CLAUDE.md`: unavailable credentials/secrets/human verification; a new paid action; destructive or irreversible data loss/external action; production/store publication; material scope/security/architecture change outside the approved baseline; or an unresolved blocker after the bounded five-iteration process.

## Update protocol
After every step, update this file with: last PASS step, evidence/commands actually run, important files/migrations, significant decisions/ADRs, unresolved risks, next step, Git/build checkpoint. Never mark a step PASS without evidence.

## Note on this file
The governance update of 2026-10-06 replaced this file with the planning-baseline template ("Implementation has NOT started"). That did not match the repository (Steps 1–27 committed, see `git log`), so the step log below was restored from the last committed checkpoint and the reconciliation recorded.

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

### Step 17 — Screen 2: Home — PASS (2026-10-06)
- Implemented: HomeScreen (trip header + day line, contextual trip-switcher sheet with "new trip", wallet cards opening/current/≈reporting, negative-wallet banner with FX/ATM/adjustment quick actions, today and trip totals with unavailable/estimated notes, recent actions), ActionRow + presentAction, JournalQueries/JournalService (list + limit only), background rate refresh.
- Evidence: `npm run verify` → 261/261 incl. 4 Home UI tests asserting displayed values equal ReportingService/ledger outputs, negative banner + quick action → /add, trip switching, empty states. New architecture guards: UI/app never import money arithmetic or ledger/reporting computation (probe verified); no control characters in source. Physical A54: Home rendered with live-rate equivalents, RTL correct.
- Fix: a guard written through a shell `node -e` lost escapes (literal backspace chars) and passed vacuously; caught by probe, rewritten with the Write tool, plus a control-character guard.

### Step 18 — Screen 3: Add Action — PASS (2026-10-06)
- Implemented: AddActionScreen — Expense (big amount, category grid, Cash / configured cards / unspecified card, remembered defaults), FX (given/received with live derived rate), ATM (received + optional local fee + funding card), Cash Adjustment under "more actions" (counted cash → derived difference via ReconciliationService); advanced details: date (calendar) + time, description, place, note, DCC "charged in another currency" (+optional amount). Mode/currency deep-link params used by Home quick actions. TripService.nowOccurrence/offsetMinutes so UI never reads the device clock.
- Evidence: `npm run verify` → 268/268 incl. 7 Add Action UI tests (minimal expense flow = amount → category → save; card+DCC; FX two legs + rate text; ATM fee; adjustment difference; validation saves nothing; chosen local time). Physical A54: 850 THB cash food + 400 USD cash shopping entered through the UI → THB ฿6,150, USD −$100 in red with banner + quick actions, today ₪1,302.17 (hand-checked 77.25 + 1,224.92).
- Dev note: Fast Refresh keeps the composed services singleton; after changing service classes, cold-start Expo Go (seen as "undefined is not a function", gone after cold start). Not applicable to release builds.

### Step 19 — Screen 4: Journal — PASS (2026-10-06)
- Implemented: JournalFilter (search over description/place/note with literal %/_ via LIKE ESCAPE '!', category, type, payment) in SQL; JournalService.days (newest first, grouped by local date); ReportingService.dailyExpenseTotals (EXPENSE only); JournalScreen (search, filter sheet, removable active-filter chips, day sections with expense totals, `?category=` entry).
- Evidence: `npm run verify` → 278/278 incl. 7 journal application tests (order, local-day grouping incl. late-night, EXPENSE-only daily totals excluding FX/ATM principal and ATM fees, search, combinable filters, deleted excluded) and 3 Journal UI tests. Physical A54: journal day header "הוצאות: ₪1,302.17" (openings excluded), RTL rows.
- Decision: day totals are the day's full EXPENSE spending regardless of active filters (spec: daily totals count EXPENSE transactions).

### Step 20 — Screen 5: Action Details — PASS (2026-10-06)
- Implemented: ActionDetailsScreen (adaptive per type, card-charge section with estimate + fee-status explanation + rate provenance + actual-charge entry, change history, edit, soft delete with confirmation, deleted state); TransactionService (details/history, setActualCharge, delete with hook point for receipts); LedgerRepository.history; Add Action edit mode (`/add?edit=<id>`, prefilled, type immutable, keeps original occurrence unless changed, signed delta for adjustments; opening balances edit via Trip Setup).
- Evidence: `npm run verify` → 283/283 incl. 5 Action Details UI tests (details/history; edit leaves exactly one active entry set and keeps time; actual charge preferred by reporting and cash-neutral; soft delete removes from balances/journal/reports with CREATE→DELETE history; deleted state not editable). Physical A54: edited the USD expense via Details→Edit; history "נוצר/נערך", original time kept, USD wallet re-derived to $50.00.
- Deferred by plan: receipt controls are attached in Step 23 (receipt lifecycle).

### Step 21 — Screen 6: Summary — PASS (2026-10-06)
- Implemented: SummaryScreen — total trip cost, during trip, today, average/day (only once the trip started; partial flag), pre/post-trip when present, category tiles (zero-spend hidden, largest first) → `/journal?category=`, ATM-fees tile, cash vs credit bar; all values from ReportingService; no budget concept.
- Evidence: `npm run verify` → 287/287 incl. 4 Summary UI tests (every figure equals ReportingService output; zero-spend tiles hidden; no budget/remaining text in the rendered tree; tile → filtered Journal; empty state, no average before trip). Physical A54: total ₪842.82 = ₪77.25 + ₪765.57 (hand-checked).

### Step 22 — Screen 7: Settings & trip/card configuration — PASS (2026-10-06)
- Implemented: SettingsScreen (trip edit entry → Trip Setup, reporting-currency picker, new trip, card list + CardSheet [issuer, optional nickname, one fee classification UNKNOWN/NO_FOREIGN_FEE/FEE_PERCENT, billing currency, archive], CategoriesSheet [create/rename/icon, delete with reassignment to Other], privacy note). App lock and PDF entries are added by Steps 24/25.
- Evidence: `npm run verify` → 293/293 incl. 6 Settings UI tests (card row has only identity columns; invalid fee % rejected; reporting-currency change leaves transactions identical; category delete reassigns via ledger; edit-trip entry; exactly seven screen routes). Physical A54: Isracard "no FX fee" card added through the sheet, listed RTL.

### Step 23 — Receipt camera & private-file lifecycle — PASS (2026-10-06)
- Implemented: expo-image-picker + expo-file-system (SDK-matched); ports ReceiptStore/ReceiptCamera; SqliteReceiptRepository; ReceiptService (attach/replace/remove/cleanup, capture); ExpoReceiptStore + expoReceiptCamera; delete hook (after commit); startup cleanup; ReceiptSection (Action Details) and capture-before-save in Add Action; app.json image-picker plugin (no microphone) + blockedPermissions. ADR-0008.
- Evidence: `npm run verify` → 305/305 (incl. 9 lifecycle + 3 receipt UI tests). Physical A54: on-demand permission dialog, real capture, thumbnail, persistence across cold restart, preview, delete. Limitation: Expo Go is not debuggable, so private files were not listed on-device; DB/file consistency is proven by tests.

### Step 24 — Optional device authentication — PASS (2026-10-06)
- Implemented: expo-local-authentication (biometrics with device-credential fallback; no custom PIN); DeviceAuth port + expoDeviceAuth; AppLockService (enable/disable require auth; locks at cold start and after ≥60 s in background; unavailable device auth never locks the owner out); LockGate overlay in the root layout; Settings switch.
- Evidence: `npm run verify` → 315/315 incl. 7 AppLockService + 3 LockGate tests (off by default, enable needs success, cannot enable without device security, re-lock threshold, failed auth keeps lock, recovery when auth disappears, disable needs auth). Physical A54 (Expo Go): toggling showed the "no screen lock on device" explanation and the switch stayed off; `adb shell locksettings verify` confirms the phone has no secure credential, so this is the correct real behavior.
- Pending owner check (Step 30): positive unlock with the owner's real fingerprint/PIN needs the owner to set a device screen lock — not changed by Claude on a personal phone.

### Step 25 — Professional PDF trip report — PASS (2026-10-06)
- Implemented: expo-print + expo-sharing; PdfExporter port + expoPdfExporter (base64 → named cache file → share sheet; old reports cleaned before export and at startup); TripReportService; Hebrew RTL A4 template with escaping; Settings export entry. ADR-0009.
- Evidence: `npm run verify` → 319/319 (4 report tests). Physical A54: share sheet with CashTravel-Thailand.pdf (not sent to anyone). Headless-Edge rendering of the template inspected; totals/averages/daily totals/wallets hand-checked.
- Fix found on device: moving the printer output failed in Expo Go ("Missing READ permission") → write from base64 into our cache.

### Step 26 — Offline & lifecycle hardening — PASS (2026-10-06)
- Fixed: background rate refresh never retried after an offline failure → useRateRefresh now also retries on app foreground (single-flight).
- Added src/application/offline.test.ts: full workflow (trip, cash/card expense, FX, ATM, reconcile) with a failing network provider; honest unavailable reporting; restart on a reopened file DB (process death) with identical state; back online → rates + derived card estimate fill in while transactions/ledger/card_charges stay byte-identical; cached rates work offline again; timezone change mid-trip keeps day grouping, "today" follows device offset.
- Evidence: `npm run verify` → 324/324. Physical A54 in airplane mode with Wi-Fi off (ping: network unreachable; DNS fails): cold start, expense saved via UI, USD wallet −$70 with banner, totals from cached rates; connectivity then restored (airplane off, Wi-Fi on, ping OK).

### Step 27 — Security & privacy hardening — PASS (2026-10-06)
- Review: docs/security/REVIEW-2026-10-06.md (12 areas). Fixed: Android Auto Backup disabled (allowBackup=false); unused VIBRATE permission blocked. Accepted with rationale: exported launcher activity + prefill-only deep links; moderate decode-uri-component DoS (fix only in next SDK); no FLAG_SECURE.
- Evidence: introspected manifest → permissions INTERNET, USE_BIOMETRIC, USE_FINGERPRINT; allowBackup=false. Greps: no http://, secrets, eval; console only one error-message warn; SQL fully parameterized. `npm run verify` → 324/324.
- Follow-up: verify the final merged manifest (library manifests incl. CAMERA) on the RC build (Step 32).

### Step 28 — Migration & data-integrity hardening — PASS (2026-10-06)
- Implemented: pre-upgrade snapshot (`needsUpgrade` + `backupDatabase` = `VACUUM INTO`, never overwrites) taken by `openAppDatabase` before any pending migration; migration-runner support for SQLite table rebuilds (`rebuildsTables`: FKs off outside the transaction, `foreign_key_check` must be clean before commit, enforcement always restored); `IntegrityService` + `SqliteIntegrityQueries` (quick_check, FK check, ledger vs cashEffects, misplaced card charges, cross-trip entries). ADR-0003 amended.
- Evidence: `src/data/db/upgrade.test.ts` (8 tests) on a populated v1 DB (every transaction type, edits, soft delete, card charge, receipt, FX cache): add-column + table-rebuild upgrades preserve every record and balance; failing upgrade rolls back completely; orphaning rebuild refused with FKs still on; snapshot is a complete openable copy; fresh DB takes no snapshot; FX cache rebuildable; tampering detected. `npm run verify` → lint 0, typecheck clean, 338/338 tests (35 suites).

### Governance reconciliation — supervisor protocol + approved UI pack — PASS (2026-10-06)
Trigger: the user added `CASH_TRAVEL_SENIOR_TECHNICAL_SUPERVISOR_AGENT.md`, `docs/ui/APPROVED_UI_SPEC.md` + 8 reference PNGs, and UI-gate rules in CLAUDE.md / START_CLAUDE.md / MASTER_BUILD_PLAN.md / PRODUCT_SPEC.md. The updated ARCHITECTURE / FINANCIAL_DOMAIN / SECURITY / README no longer carry the implementation notes appended in earlier steps; the user's versions are kept as-is (the same facts live in ADR-0001…0010 and docs/security/REVIEW-2026-10-06.md).
- **Preserved (compliant):** all domain/financial engines, ledger, schema + migrations, repositories, services, FX/card/reporting semantics, receipts, PDF, app lock, offline behavior, seven-screen routing, RTL strategy, every behavioral test.
- **Non-compliant → corrected:** the visual system of all seven screens did not follow the approved references (beige/teal notebook look, no travel-photo headers, no flags, ".00" amounts, verbal dates). Reworked to the reference composition with no behavior change: new tokens; `PhotoHeader` (bundled CC0 photo, docs/ui/ASSETS.md); `Flag` (emoji); reference-style rows, wallet cards, mode tiles, category/payment tiles, 2×2 detail grid, conversion card, receipt tiles, category bars, grouped settings; bottom nav per spec. Display-only: exact zero-fraction trimming, `dd.mm.yyyy` dates, reference equivalents via new `ReportingService.equivalent()` / domain `quoteRate` (cached rates, never on a save path). Dead `Placeholder.tsx` removed. PDF export shared by Settings and Summary (`useReportExport`). ADR-0010; ADR-0007 amended.
- **Deliberate deviations (written spec beats old mockup content):** no budget/"remaining", no Duplicate action, no notifications/language/country rows, no card numbers/brand logos, no Summary recent list/balance card, no Journal currency strip — listed in ADR-0010.
- **Evidence:** `npm run verify` → lint 0 warnings, typecheck clean, 338/338 tests (new: display-format/flag rules, exact `equivalent()` rate). Physical Galaxy A54 (Android 16, he-IL, user font scale 1.3) via Expo Go, live data, each screen compared with its reference: Home, Journal, Add Action (expense + ATM modes), Action Details, Summary, Settings, Trip Setup (edit). Deviations found on device and fixed: truncated labels at 1.3 font scale, oversized Settings photo, bidi order in the conversion line, duplicated subtitle.
- **Git:** branch `main`, no remote; governance docs and reconciliation committed locally (see git log).

### Step 29 — Full automated regression gate — PASS (2026-10-06)
- Added `src/regression.test.ts`: the supervisor §14 matrix as one deterministic trip with exact hand-computed figures at every stage — opening THB/USD/EUR; cash vs credit expense; USD→THB exchange; card-funded THB ATM withdrawal with local fee; ±cash adjustments; negative EUR cash; edit; soft delete; pre-trip expense (total ₪2,762 vs during ₪762); VND without rate (saved, reported unavailable); later rate enrichment (+₪16, transactions/ledger/card_charges byte-identical); custom category create→use→delete-to-Other; reporting currency ILS→USD→ILS (₪2,788 ↔ $697, originals unchanged); second trip isolation and current-trip switch. Ledger consistency + IntegrityService checked after each stage.
- Evidence: `npm run verify` → lint 0 warnings, typecheck clean, 352/352 tests in 36 suites; no skipped/focused/todo tests (grep). `npm run test:live` (real ECB/Frankfurter + currency-api endpoints) → 2/2. Verification level: automated (+ live network contract test).

### Step 30 — Android physical-device acceptance QA — PASS (2026-10-06)
Physical Galaxy A54, Android 16, Hebrew/RTL, font scale 1.3, Expo Go 57.0.9 (Metro over `adb reverse`), redesigned UI. New trip "QA" driven end to end through the UI (adb taps by testID; values read from the accessibility tree):
| Scenario | Result |
| --- | --- |
| Trip setup with opening THB 5,000 / USD 200 | Home ฿5,000 / $200 |
| Cash expense 300 THB (food) | THB 4,700 |
| Credit expense 1,200 THB (Isracard) | cash unchanged ฿4,700; card estimate ₪109.06 "no FX fee", ECB source/date |
| FX: gave $100, received ฿3,200 | ฿7,900 / $100; effective rate "1 USD = 32 THB"; not in spending |
| ATM card-funded ฿2,000 + local fee ฿220 | ฿9,900 (fee not cash) |
| Negative cash: $500 cash expense | −$400 in red + guidance banner; saved |
| Cash adjustment (counted $0) | difference +$400 shown and recorded; $0 |
| Receipt | camera permission flow → real capture → thumbnail on the card expense |
| Actual card charge ₪112.40, then edit amount → ฿1,250 | actual preserved; history: created / actual / edited |
| Soft delete of the $500 expense | removed from journal; USD re-derived to $500 |
| Journal | day total ₪139.66 = expenses only (₪27.26 + actual ₪112.40) |
| Offline: airplane on + Wi-Fi off (ping unreachable), cold start, add $150 expense | saved; $350; connectivity, Wi-Fi and Bluetooth restored to prior state |
| Reporting currency ILS→USD→ILS | Summary $202.13 (categories/percent in USD), back to ILS |
| PDF | share sheet with CashTravel-QA.pdf (dismissed; nothing sent) |
| Restart | cold start: trip and balances identical |
| Optional app lock | device has no screen lock → correct explanation, switch stays off |
- Defects: none in the app. (One operator input error during editing — text inserted before the old value — was corrected through the same edit flow; it exercised edit + history.)
- **Owner-only pending check:** positive biometric/PIN unlock on a phone with a configured screen lock. The test phone is the owner's personal device without a secure lock; Claude does not change its security settings. The positive path is covered by automated AppLockService/LockGate tests (enable requires auth, relock after 60 s, failed auth keeps lock).

### Step 31 — Release-readiness audit — PASS (2026-10-06)
- Checklist and known limitations: `docs/release/READINESS-V1.md` (scope, excluded features, permissions, security, dependencies, migrations, versioning, build config, assets, docs).
- Fixed: launcher/adaptive/monochrome/favicon icons were still the Expo template art → generated Cash Travel icon (blue tile, suitcase + coin; SVG rendered with sharp run from the session scratchpad, not a project dependency); adaptive background #1565F0; explicit `android.versionCode: 1`.
- Evidence: scope grep clean; 7 screen routes; `npx expo-doctor` 21/21; `npm ls` clean; `npm audit --omit=dev` 63 advisories, all build/test tooling except accepted runtime decode-uri-component; `npx expo config` resolves versionCode 1 / new background.
- Noted for Step 35: `assets/splash-icon.png` is referenced nowhere (template leftover).

### Step 32 — Release candidate build — PASS (2026-10-06)
- Source revision: `a65917d5146d10c68febad10b393b9639075300f` (Step 31 commit; working tree clean apart from the new build doc). Built from the ASCII mirror `C:ctb` per `docs/release/LOCAL_BUILD.md`: `expo prebuild --platform android --no-install` → `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` → BUILD SUCCESSFUL in 1 h 18 m.
- Artifact: `app-release.apk` 46,512,900 bytes, SHA-256 `23910c388f845dbf751f265247549eeb8109805b443b802fb59d719ffc26e1a3`; package com.cashtravel.app, versionCode 1, versionName 1.0.0, compile/target SDK 36, native code arm64-v8a. Signed with the template debug key (installation testing only).
- Merged manifest (aapt2): permissions INTERNET, USE_BIOMETRIC, USE_FINGERPRINT, CAMERA (image picker, requested at runtime) + the platform's non-exported dynamic-receiver permission; allowBackup=false; only MainActivity exported; all providers/crop activities exported=false; expo-updates disabled.
- Device (A54): fresh install → native RTL first-run Trip Setup with the new icon/visual system; trip "RC" + opening ฿1,000 + ฿250 cash expense → ฿750, live ECB rate (≈ ₪22.70); `adb install -r` upgrade-in-place (lastUpdateTime changed) → data intact after relaunch.
- Not done (owner gate): production signing/upload keystore and store publication.

### Step 33 — Final V1 handoff — PASS (2026-10-06)
- Updated: README (V1 status, document map, quick start), ARCHITECTURE (implementation map), FINANCIAL_DOMAIN (implementation notes), SECURITY (implementation status + release manifest), TESTING (where each suite lives), ADR index (0001–0010). Known limitations and accepted risks: `docs/release/READINESS-V1.md`. Operations: `docs/ENVIRONMENT.md` (dev/device) and `docs/release/LOCAL_BUILD.md` (RC build). The user's governance text in these documents is unchanged; only sections were appended.
- Recovery check: a new session following CLAUDE.md's reading order reaches this file, whose step log records every decision, command and evidence; no chat history is needed.
- V1 checkpoint: the final Step 35 commit, tagged `v1.0.0` locally (not pushed).

### Step 34 — Lean Architecture Audit — PASS (2026-10-06)
- Report: `docs/release/LEAN_AUDIT-V1.md` (19 runtime deps each justified, incl. required router/icon peers; ports/services/useQuery kept with reasons; runtime checks: no background work/analytics, offline save path, bounded startup, indexed per-trip queries).
- Removed dead code: `subtract`, `negate`, `sum`, `isNegative`, `isZero`, `isPositive`, types `PaymentMethod`, `CategoryIcon` (no production references; exact-addition test kept via `add`). Dependencies removed: none (none unused).
- Evidence: dependency import/peer scan; exported-symbol reference scan; `npm run verify` → lint 0, typecheck clean, 352/352.

### Step 35 — Final Repository Hygiene & Clean Verification — PASS (2026-10-06)
**Removed (evidence-based):**
- `assets/splash-icon.png` — Expo template image referenced by no config, code or build file (app.json/src grep; prebuild has no splash plugin).
- `.expo/` — git-ignored Metro/Expo dev cache (regenerated on `expo start`).
- `C:ctb` — ASCII build mirror + Gradle/NDK intermediates (~3+ GB) created for Step 32; fully reproducible via `docs/release/LOCAL_BUILD.md`; the RC was already verified and installed.
- Temporary files outside the repo: `/tmp/ps_old.md` (state restore helper), the export test output, session scratch helpers/screenshots/sharp install (session temp dir).
- Stopped every background process started during the work (Metro instances on :8081, adb watcher); `adb reverse` mappings removed.
- Dead code (Step 34): eight unused money/ledger helpers/types; (reconciliation) `Placeholder.tsx`.

**Retained (intentionally):**
- `src/testing/**` — test harness (node:sqlite adapter, fakes, fixtures) used by the suites; excluded from the app bundle.
- `*.live.test.ts` — opt-in live FX contract test (`npm run test:live`), excluded from CI by jest config.
- `assets/favicon.png` — referenced by `app.json` (web config).
- `docs/ui/references/*.png` — approved visual contract (user-provided, authoritative).
- `docs/release/*`, `docs/security/*` — release checklist, build guide, lean audit, security review.
- Outside the repo, not ours to delete: `C:ak-sdk`, `C:ak-jdk`, `C:ak-gradle` (sibling project's toolchain; used read-mostly as build caches). On the phone: the RC app `com.cashtravel.app` (installed for owner testing; contains trip "RC") and Expo Go dev data (trips Thailand/QA) — owner's device data, left in place.

**Dependencies removed:** none (all 19 runtime + dev dependencies are used/required — Step 34).

**Final repository status:** working tree clean after commit; no known disposable development artifacts remain in the repository; `.gitignore` covers node_modules, .expo, native folders, keys/keystores and local env files.

**Post-cleanup verification:**
- `npm ci` (clean dependency install from the lockfile) → success.
- `npm run verify` → lint 0 warnings, typecheck clean, **352/352 tests in 36 suites** (financial engines, SQLite migrations/upgrades, regression matrix, offline/lifecycle, UI/navigation).
- `npx expo-doctor` → 20/21: the one failing check reports six SDK-57 patch releases published after the RC (expo 57.0.27, expo-asset 57.0.19, expo-constants 57.0.21, expo-linking 57.0.12, expo-router 57.0.25, expo-sqlite 57.0.4). Intentionally not upgraded after device/RC verification (the lockfile pins the verified versions); routine maintenance item.
- `npx expo export --platform android` → production Hermes bundle built (3.6 MB).
- Physical A54 (Expo Go) cold start of the final code → Home renders with persisted data.
- Native RC (Step 32) remains representative: no native dependency or config change since, except removing an unreferenced asset.

## Owner-only items (not blockers for V1 completion)
1. Positive app-lock unlock on a phone with a configured screen lock (automated tests cover it).
2. Production signing keystore and any store publication.

## Remote repository (2026-10-06)
- GitHub: https://github.com/simofe8-png/cash-travel (private) — remote `origin`, branch `main`; the remote development source of truth from now on.
- Pushed: full history of `main` (HEAD `a368089` at publication) and tag `v1.0.0`.
- Release: https://github.com/simofe8-png/cash-travel/releases/tag/v1.0.0 — pre-release "TEST / LOCAL RC (not a Google Play release)", asset `app-release.apk` (46,512,900 bytes, SHA-256 `23910c38…e1a3`, built from `a65917d`; recovered byte-identical from the verified installation on the A54 because the build mirror had been cleaned).
- Pre-publication checks: clean tree; tag = HEAD; no key/keystore/env/db/apk/log/native/cache file in any commit (history name + content scan); post-publication: remote file list identical to `git ls-files` (211 files), remote main/tag SHA = local, release asset downloaded and hash-matched.

