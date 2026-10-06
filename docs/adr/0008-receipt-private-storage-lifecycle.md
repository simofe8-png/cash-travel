# ADR-0008 — Receipt photos: capture and private-file lifecycle

## Status
Accepted (Step 23, 2026-10-06).

## Decision
- **Capture:** `expo-image-picker` `launchCameraAsync` (system camera). Camera permission is requested only when
  the user taps "צילום קבלה". Config plugin: `microphonePermission: false`; `android.blockedPermissions` blocks
  storage/media/audio/location permissions (verified on the merged manifest at the security step).
- **Storage:** `expo-file-system` app-private `Paths.document/receipts/`, file names `r-<random>.jpg` (validated by
  regex in the adapter and by a DB CHECK forbidding `/` and `..`). The camera's cache copy is deleted after import.
  No shared storage, no gallery, no upload. Receipts are not embedded in PDFs by default.
- **Consistency:** attach = copy file → write `receipts` row in a SQLite transaction → delete the replaced file after
  commit; if the row write fails the new file is deleted. Remove = delete row → delete file. Deleting an action
  removes its photo after the delete commits (TransactionService hook; failures never undo the delete).
- **Startup cleanup (bounded):** remove receipts of soft-deleted actions, drop rows whose file is missing, delete
  unreferenced files older than 1 hour (grace period protects an in-flight attach).
- Ports `ReceiptStore`/`ReceiptCamera` keep UI and application code free of Expo modules; tests use in-memory fakes.

## Alternatives considered
- `expo-camera` in-app viewfinder: larger surface and more UI to maintain for a simple photo.
- Storing images as BLOBs in SQLite: bloats the authoritative DB and backups of financial data.

## Verification
`src/application/receipts/ReceiptService.test.ts` (9: attach, replace, failed write → no orphan, failed copy → no row,
remove, delete-hook, money untouched, cleanup cases, camera port) and `src/ui/components/ReceiptSection.test.tsx`
(3). Physical A54 (Expo Go): permission prompt appeared only on tap; Samsung camera capture → thumbnail; persisted
across cold restart; full-screen preview; delete via native confirmation → empty state.
