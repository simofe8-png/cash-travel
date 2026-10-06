# ADR-0003 — SQLite schema and migration strategy

## Status
Accepted (Steps 4–5, 2026-10-06).

## Context
SQLite is the authoritative store. The schema must make the Transaction Ledger the single source of
truth, keep financial edits auditable, support soft delete, and evolve only via migrations.

## Decision
### Migration framework (`src/data/db/migrate.ts`)
- Migrations are numbered 1..N without gaps, append-only. Each runs in its own atomic transaction that also
  inserts its `schema_migrations` row and sets `PRAGMA user_version`. A failure rolls back that migration
  entirely and aborts startup with a `MigrationError`; the DB stays at the last good version.
- A DB newer than the app is refused, never modified. `PRAGMA foreign_keys=ON` on every connection, verified;
  `PRAGMA foreign_key_check` after migrating. Device connections use WAL.

### Schema v1 (`migrations/0001_core_schema.ts`), all tables STRICT
| Table | Purpose |
| --- | --- |
| `trips` | name, date-only start/end (CHECK valid, end ≥ start), reporting currency (default ILS), per-trip fast-entry defaults (last currency / payment method / card) |
| `cash_wallets` | one physical cash wallet per (trip, currency), UNIQUE |
| `categories` | 6 seeded built-ins by `builtin_key` (Hebrew labels in UI, never archivable) + custom (name, unique among active; archived instead of deleted) |
| `cards` | issuer (ISRACARD/MAX/CAL/OTHER), one optional classification (default UNKNOWN), nickname, billing currency. **No number/CVV/expiry/last-4 columns.** |
| `transactions` | parent user action. Type ∈ 5 approved types; per-type shape enforced by a CHECK (e.g. EXPENSE needs amount>0, category, payment method; FX needs two different currencies; ADJUSTMENT non-zero signed). `occurred_at` (UTC instant) + `occurred_local_date` + `tz_offset_min` so day grouping is fixed at entry time; `created_at/updated_at`; `deleted_at` soft delete; `revision`. |
| `ledger_entries` | physical cash effects (wallet, signed non-zero minor amount, revision). Immutable (UPDATE/DELETE triggers abort). Wallet must belong to the transaction's trip (trigger). |
| `card_charges` | card cost for card expenses / card-funded ATM: billing currency, charged currency (DCC), estimate (status ESTIMATED/UNAVAILABLE, fee status INCLUDED/NONE/UNKNOWN, rate + source + date, rule-set version/rule id) and actual (amount + entered_at) **kept separately** |
| `transaction_history` | audit trail: CREATE / EDIT / DELETE / ACTUAL_CHARGE with JSON snapshot and revision |
| `fx_rates` | reference-rate cache with provenance (source, base, quote, rate TEXT, rate_date, fetched_at), UNIQUE per source/pair/date |
| `card_rule_sets` | versioned card-cost rule data (source, effective_from, JSON payload) |
| `receipts` | one photo per transaction; bare file name inside app-private dir (CHECK forbids `/` and `..`) |
| `app_settings` | key/value (current trip, app-lock flag) |

### Ledger revisions
Balance = Σ `ledger_entries.amount_minor` for a wallet where the entry's `revision` equals its parent's current
`revision` and the parent is not soft-deleted. An edit bumps the parent revision and writes a fresh entry set in
the same SQLite transaction; superseded entries stay for audit and contribute zero. Transactions cannot be hard
deleted (trigger) and their type/trip are immutable (trigger).

### Identifiers and time
INTEGER primary keys (local-only V1; no sync). Instants are ISO-8601 UTC strings; dates are `YYYY-MM-DD`.

## Alternatives considered
- Per-type detail tables for each transaction type: more joins on every Journal/Reporting query for little gain;
  a single parent table with a per-type CHECK gives the same integrity.
- Deleting and re-inserting entries on edit: loses the audit trail. Reversal entries: exposes accounting
  complexity and complicates reporting. Revisioned entries keep both simplicity and history.
- UUID keys: needed only for future sync; would require an extra dependency today.

## Consequences
The DB itself rejects most invalid financial states even if application code regresses.

## Verification
`src/data/db/migrate.test.ts` (12) and `src/data/db/schema.test.ts` (12): STRICT tables, indexes, seeds, per-type
CHECKs (incl. INCOME/REFUND rejected), FK/trigger enforcement, immutability, soft-delete-only, card credential
columns absent, estimate/actual consistency, FX cache uniqueness, receipt path confinement.

## Amendment — Step 28 (2026-10-06): upgrade safety and integrity
- **Pre-upgrade snapshot.** When the stored schema version is older than the app's (`needsUpgrade`), the app writes
  `VACUUM INTO <documents>/SQLite/cashtravel.pre-upgrade-v{N}.db` before migrating (never overwriting an existing
  snapshot). The copy stays app-private (backup is disabled, ADR/SECURITY review). A fresh install takes no snapshot.
- **Table rebuilds.** A migration may set `rebuildsTables: true`. The runner then switches foreign-key enforcement off
  *outside* the transaction (SQLite cannot change it inside one), runs the migration, requires `PRAGMA
  foreign_key_check` to be empty before committing, and always restores enforcement afterwards — SQLite's documented
  12-step procedure. A rebuild that would orphan rows is rolled back completely.
- **Integrity check.** `IntegrityService.check()` (port `IntegrityQueries`) combines `PRAGMA quick_check`,
  `foreign_key_check`, ledger-vs-`cashEffects` consistency, card charges attached to non-card actions and
  cross-trip ledger entries. Verified by `src/data/db/upgrade.test.ts` on a populated v1 database (every
  transaction type, edits, soft delete, card charge, receipt, FX cache).
