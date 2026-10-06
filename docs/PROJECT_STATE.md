# Cash Travel — Project State — Execution Checkpoint

## Execution mode
AUTONOMOUS END-TO-END.

PASS is an internal quality gate. Claude does not ask the user for permission between normal Master Build Plan steps. After a verified PASS, Claude updates this file and immediately continues to the next numbered step.

## Current status
Implementation in progress.

## Authoritative next step
`docs/MASTER_BUILD_PLAN.md` — Step 6: Ledger Engine.

## Last completed build step
Step 5 — Core database schema — PASS.

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
