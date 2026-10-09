# ADR-0013 — Trip documents (import, private storage, in-app viewer)

## Status
Accepted (2026-10-09, owner-approved scope extension "Trip Documents").

## Context
The owner approved a per-trip document store (tickets, bookings, insurance, passport copies), reachable from the
bottom navigation, available offline, with import of PDF/JPG/PNG/HEIC, camera capture, an in-app zoomable viewer,
rename, share and delete. V1 previously excluded a document manager and had seven screens; this ADR records the
approved exception. Still out of scope: OCR, parsing, cloud storage/sync, background processing.

## Decision
- **Navigation:** an eighth screen, `מסמכים`, as a tab: `בית | יומן | ＋ | מסמכים | סיכום | הגדרות`. Tab labels are
  single-line, scale with the system font up to 1.4× and shrink rather than wrap or clip. Secondary flows
  (actions, rename) are sheets; the viewer is a full-screen modal — no further routes.
- **Data:** migration 0003 `trip_documents` (STRICT): id, trip_id (FK trips), file_name (bare name; CHECK forbids
  `/`, `\`, `..`; UNIQUE), original_name, display_name (non-empty), mime_type (CHECK: pdf/jpeg/png/heic),
  size_bytes, created_at; index `(trip_id, created_at)`. The local path is `<app documents>/documents/<file_name>`;
  an absolute path is deliberately not stored (the app container path is not stable). Not financial data: no ledger
  effect, no architecture-guarded table touched.
- **Import:** system picker via `expo-file-system` `File.pickFileAsync` (Storage Access Framework — no storage
  permission; `expo-document-picker` was evaluated and dropped as redundant). The picked `content://` file is copied
  at once into the app cache, then validated **by content** (magic bytes: `%PDF-`, JPEG, PNG, HEIF brands), size
  (> 0, ≤ 50 MB) and free space (file + 20 MB reserve), then copied into private storage as `d-<random>.<ext>` and
  the row written in a SQLite transaction; a failed row write deletes the copy; temporary copies are always removed.
  Camera capture reuses `expo-image-picker` (permission requested only when invoked), stored as JPEG named
  `מסמך מצולם <date> <time>`.
- **Viewer:** local Expo module `modules/document-render` (Kotlin, Android platform APIs only): `PdfRenderer` renders
  PDF pages and `ImageDecoder` decodes images (HEIC included, EXIF orientation applied, longest side bounded) into
  JPEGs in `cache/doc-view/<file_name>/` (regenerable; reused when present; written via a temporary name). It only
  reads/writes inside the app's files/cache directories. PDF pages render lazily (visible page ± 1) at 2× the
  screen's pixel width (≤ 2400 px); only those pages keep images mounted (bounded memory). Zoom/pan use
  `react-native-gesture-handler` + `react-native-reanimated` (already linked natively as expo-router peers; now
  declared at SDK-57 versions): pinch 1×–5× around the fingers, one-finger pan with momentum, double tap 1× ↔ 2.5×,
  natural vertical scrolling at 1×. Damaged/password-protected files, a missing private file or a platform without
  the module (Expo Go/iOS) show an explanation with sharing as the way out.
- **Share:** a copy named after the display name in `cache/doc-share/` through the Android share sheet
  (`expo-sharing`); replaced at the next share and removed at app start.
- **Delete:** confirmation → row delete (transaction) → file + renders deleted. **Trip deletion** (ADR-0012) removes
  the trip's document rows in the same transaction and their files after commit; other trips are untouched.
- **Startup cleanup (bounded):** removes temporary import/share copies, renders of deleted documents, and
  unreferenced document files older than 1 hour. Rows whose file is missing are **kept** and shown as missing, so
  the user decides (no silent loss of the record).
- **Trip isolation:** every service call takes the trip id and refuses a document of another trip.

## Alternatives considered
- `react-native-pdf` (+ `react-native-blob-util`): two third-party native libraries (PdfiumAndroid) for what the
  platform `PdfRenderer` already provides.
- WebView + pdf.js: a new native dependency plus a bundled ~1 MB JS renderer; WebView cannot show HEIC.
- Opening files in an external app: not an in-app, offline-guaranteed viewer.
- Storing files as SQLite BLOBs: bloats the authoritative financial database.

## Consequences
- Native runtime change (new local module; gesture/reanimated/worklets versions aligned to SDK 57): a new TEST build
  is required; OTA updates for it cannot reach older binaries (fingerprint, ADR-0011).
- No new Android permission. Documents stay app-private (`allowBackup=false` unchanged); they leave only through the
  user's explicit share.
- iOS later: implement the same three module functions with PDFKit/ImageIO; the JS side is platform-neutral.

## Verification
`src/domain/document/document.test.ts`, `src/application/documents/DocumentService.test.ts`,
`src/data/db/tripDocumentsMigration.test.ts`, `src/ui/viewer/zoom.test.ts`, `src/ui/screens/DocumentsScreen.test.tsx`;
device evidence in `docs/PROJECT_STATE.md`.
