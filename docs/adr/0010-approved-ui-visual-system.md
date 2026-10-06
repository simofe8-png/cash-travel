# ADR-0010 — Approved UI visual system (reconciliation with docs/ui)

## Status
Accepted (governance reconciliation, 2026-10-06). Supersedes the *Design system* section of ADR-0007; ADR-0007's
navigation, RTL and state decisions remain in force.

## Context
The approved UI reference pack (`docs/ui/APPROVED_UI_SPEC.md` + `docs/ui/references/*.png`) was added after Steps
15–25 had built the seven screens with a "paper notebook" palette (beige/teal, no photo headers, no flags). The
references are the mandatory visual contract; the written product/domain documents still govern behavior.

## Decision
1. **Tokens** (`src/ui/theme/tokens.ts`): light blue-grey page, white rounded cards with a soft shadow, navy ink,
   one blue accent (`#1565F0`) for primary actions/selection/navigation, red for spending and negative cash, green
   for positive cash/received money, per-category accent colors.
2. **Travel-photo header** (`PhotoHeader`): Home, Journal, Summary, Settings, Trip Setup and Action Details (darker
   overlay) use a full-bleed photo header with centered white title lines; the screen body overlaps it with a
   rounded top (`Screen header=`). Add Action keeps the reference's plain header (close ✕, title, three mode tiles).
   The photo is one bundled CC0 image (`assets/images/travel-header.jpg`, provenance in `docs/ui/ASSETS.md`), ~300 KB,
   no network, no new dependency.
3. **Currency flags** are Unicode regional-indicator emoji derived from the ISO-4217 code (`Flag`), no image assets.
4. **Amounts** show no ".00" when the fraction is exactly zero (string-based, never rounded); a non-zero fraction is
   always shown. Spent amounts in lists use a display-only leading minus (`formatMoney(..., { outflow: true })`).
   Dates use the references' numeric style `dd.mm.yyyy`.
5. **Bottom navigation** is exactly `בית | יומן | ＋ | סיכום | הגדרות` with filled active icons, an active underline
   and a raised blue ＋.
6. **Display-only reference equivalents** (Add Action "≈ total in reporting currency", Action Details "conversion to
   ILS") come from `ReportingService.equivalent()` (cached rates only; exact `quoteRate` division in the domain).
   They are never on a save path and never stored.

## Deliberate deviations from older mockup content (written spec wins)
- No Budget / "remaining" figures; Summary's mockup "current balance / income" card and recent-actions list are not
  reproduced (Summary is a spending dashboard; Journal is the history destination).
- Journal: no per-currency "summary to date" strip and no row-level reporting conversions (composite reference,
  "calm and sparse" rule); quick type segments + search + filter sheet are kept.
- Action Details: no "Duplicate action" button (removed from V1); the footer holds Delete, Edit is in the header.
- Settings: no language/display/notifications/country rows, no card numbers or brand logos (issuer-only cards are
  shown with a colored card badge); version + privacy statement under "About".
- Trip Setup follows the composite reference (single screen, photo header) as described by the spec; the
  individual two-step mockup's drag handles are not implemented (no reordering in V1).
- Home: no notifications bell; the header buttons are trip switch and Settings.

## Consequences
- Visual-only change: no schema, ledger, reporting-semantic or permission change. All financial tests unchanged.
- Verified on the physical Galaxy A54 at the user's 1.3 font scale; labels were adapted (wrapping, shorter captions)
  so nothing important truncates.
