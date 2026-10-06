# Cash Travel V1 — Lean Architecture Audit (Step 34, 2026-10-06)

Classification: **KEEP / SIMPLIFY / REMOVE / DEFER**.

## Runtime dependencies (19)
| Package | Purpose / evidence | Verdict |
| --- | --- | --- |
| expo, react, react-native | Platform | KEEP |
| expo-sqlite | Authoritative local DB (`ExpoSqliteDatabase`) | KEEP |
| expo-router | 7-screen navigation (23 imports) | KEEP |
| expo-linking, expo-constants, react-native-screens, react-native-safe-area-context | Required peers of expo-router (non-optional `peerDependencies`); safe-area also used directly (5 imports); constants also shows the app version | KEEP |
| @expo/vector-icons | Icon set (single `Icon` primitive) | KEEP |
| expo-font, expo-asset | Required peers of @expo/vector-icons / bundled photo asset (expo-doctor) | KEEP |
| expo-localization | Config plugin only: native `forcesRTL` for builds (no JS import by design) | KEEP |
| expo-status-bar | Light/dark status bar over photo headers | KEEP |
| expo-file-system | App-private receipt files, report PDF file | KEEP |
| expo-image-picker | Camera capture for receipts (no media-library access) | KEEP |
| expo-local-authentication | Optional device-credential app lock | KEEP |
| expo-print | Local HTML→PDF report | KEEP |
| expo-sharing | Android share/save sheet for the PDF | KEEP |

Dev dependencies (jest, jest-expo, RNTL, eslint, eslint-config-expo, typescript, @types/*) are all used by `npm run verify`. **No unused or unjustified dependency found; none removed.** No state-management, analytics, crash-reporting, polyfill or helper package exists.

## Layers and abstractions
| Item | Finding | Verdict |
| --- | --- | --- |
| Ports (SqlDatabase, repositories, Clock, FxRateProvider, ReceiptStore, DeviceAuth, PdfExporter, IntegrityQueries) | Each has exactly one production adapter and one test adapter (node:sqlite / fakes); they are what lets 352 tests run without a device. | KEEP |
| Services (one per use case) | Thin, no duplication; `createServices` is the only wiring point (app + tests). | KEEP |
| `AppProvider` + `useQuery` | Minimal re-read-on-change mechanism; no global store, no duplicated financial state. | KEEP |
| Report export flow | Was implemented inside Settings; Summary needed the same → shared `useReportExport` hook. | SIMPLIFIED (reconciliation) |
| Dead code | `Placeholder.tsx` (reconciliation); domain helpers `subtract`, `negate`, `sum`, `isNegative`, `isZero`, `isPositive`, types `PaymentMethod`, `CategoryIcon` — no production references (scan: exported names referenced in no other source file / only in their own test). | REMOVED |
| Exports used only inside their module (input/report types, constants) | Harmless type-level visibility; un-exporting them changes nothing at runtime. | KEEP |
| Test-only helpers kept: `isExpense`, `atmFeeCost`, `toMajorString`, `normalize` | Domain semantics documented and pinned by tests; `toMajorString` is used by `formatAmount`; removal would weaken invariant tests. | KEEP |

## Runtime behavior
| Check | Evidence | Verdict |
| --- | --- | --- |
| No background services / timers / analytics | grep: no `setInterval`, TaskManager, BackgroundFetch, analytics/crash SDKs; `fetch` only inside the two FX providers. | PASS |
| Save path is offline | Services write SQLite synchronously; FX refresh only in `useRateRefresh` (UI effect, failures ignored); `offline.test.ts` + device airplane-mode test (Step 30). | PASS |
| Bounded startup | Open DB → migrate (snapshot only if an upgrade is pending) → receipt/PDF cleanup in try/catch; no network. | PASS |
| Queries | Balances, journal, reporting are per-trip SQL with indexes `ix_tx_trip_active_time`, `ix_tx_trip_type_date`, `ix_le_tx_rev`, `ix_fx_lookup`; Home "recent" uses `LIMIT`. Journal loads one trip's rows (a trip is small); no whole-database loads. | PASS |
| Ledger is the source of truth | No stored balance column (architecture test); UI imports no money arithmetic (architecture test). | PASS |

## Deferred
- Pagination for very long journals — DEFER (not needed for trip-sized data; revisit if real trips exceed a few thousand actions).

## Verification after simplification
`npm run verify` → lint 0 warnings, typecheck clean, 352/352 tests (36 suites).
