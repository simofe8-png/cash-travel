# ADR-0001 — Layering and dependency direction

## Status
Accepted (Step 2, 2026-10-06).

## Context
ARCHITECTURE.md requires UI / application / domain / repository / infrastructure layers, a Ledger Engine
that is the only writer of financial effects, and no UI→SQLite writes. Rules that are only written down
erode; they must be enforced mechanically and cheaply.

## Decision
Source layout under `src/`:

| Folder | Role | May import |
| --- | --- | --- |
| `domain/` | Pure TS engines: Money, Ledger, Expense, FX, Card Cost, Reporting | `domain` only |
| `application/` | Use-cases + ports (`application/ports`, e.g. `SqlDatabase`, repositories, FX provider) | `domain`, own ports |
| `data/` | SQLite schema, migrations, repository implementations against the `SqlDatabase` port | `domain`, `application` |
| `infrastructure/` | Platform adapters: expo-sqlite, FX HTTP, private files, PDF/share, device auth | `data`, `application`, `domain`, platform |
| `ui/` (+ `app/` routes) | Screens/components; render state, capture intent | `application`, `domain` (types/formatting), platform UI |
| `composition/` | Composition root wiring adapters into use-cases | everything |

Enforced by `no-restricted-imports` overrides in `eslint.config.js`; `npm run lint` fails on a violation.

The `SqlDatabase` port is **synchronous** (`exec/run/get/all`). Device: expo-sqlite sync API. Tests:
Node's built-in `node:sqlite` (no extra dependency). The identical SQL and transaction code therefore runs
under real SQLite in automated tests.

## Alternatives considered
- Dependency-cruiser / eslint-plugin-boundaries: an extra dependency for what `no-restricted-imports` already does.
- Async SQL port: interleaving of awaits inside a transaction risks partial writes; data volumes are small, so sync is simpler and safe.
- sql.js (WASM) for tests: an extra dependency; `node:sqlite` is built into Node 24.

## Consequences
- Domain is portable (future iOS) and unit-testable without mocks.
- UI cannot reach SQLite; all persistence goes through application use-cases.

## Verification
Step 2: probe files importing `react`/`data` from domain and `infrastructure`/`expo-sqlite` from UI produced 4 `no-restricted-imports` errors; removed afterwards; `npm run lint` and `npm run typecheck` clean.
