# ADR-0009 — PDF trip report generation and sharing

## Status
Accepted (Step 25, 2026-10-06).

## Decision
- `TripReportService.data()` assembles `TripReportData` exclusively from ReportingService / JournalService /
  Category / Card services; the HTML template (`src/ui/report/reportHtml.ts`) performs no financial calculation.
- Rendering: `expo-print` `printToFileAsync({ html, A4 595×842, base64: true })`; the adapter writes the bytes to
  `Paths.cache/CashTravel-<safe trip name>.pdf` and opens `expo-sharing`'s Android share/save sheet (Drive, Files,
  WhatsApp, email…). No direct Drive or cloud integration. (Writing from base64 avoids the printer output directory,
  which the file-system API could not move in Expo Go — observed on the A54.)
- Lifecycle: previous report PDFs are deleted before each export and at app start (kept until then because some
  share receivers read the file after the sheet closes). The printer's own temp file is deleted best-effort.
- Content: Hebrew RTL A4 — trip, dates, reporting currency, generation time; clear "report only — not a backup,
  not restorable; receipts not included" notice; summary stats with estimated/unavailable markers; categories;
  wallets (opening/current); day-grouped journal with expense-only daily totals; rate-source footer.
- Safety: all user text HTML-escaped; no images, scripts or file URIs are emitted. `expo-sharing`'s share-into-app
  intent filters stay disabled (plugin default).

## Verification
`src/ui/report/reportHtml.test.tsx` (figures equal ReportingService; escaping of injected `<script>`/`<img>`; no
images/file URIs even with a receipt attached; report-only notice; Settings export → exporter with safe file name).
Physical A54 (Expo Go): export produced `CashTravel-Thailand.pdf` in the Android share sheet (dismissed without
sending). The same HTML rendered to PDF with headless Edge on the dev machine and inspected page by page; figures
hand-checked.
