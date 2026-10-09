# Cash Travel — Approved UI Reference Specification

## Authority
The PNG files under `docs/ui/references/` are the approved visual direction for Cash Travel V1. They are implementation references, not inspiration to redesign.

Claude must inspect these images before implementing or materially changing any screen. Preserve the approved visual language: Hebrew RTL, travel-photo header treatment where shown, white/light surfaces, rounded cards, restrained blue accent, clear financial hierarchy, compact transaction rows, currency flags/symbols, and the fixed bottom navigation.

### Conflict rule — critical
The **current written product/domain specifications override obsolete text or behavior visible inside an older mockup**. The images are authoritative for visual composition and style; `PRODUCT_SPEC.md`, `FINANCIAL_DOMAIN.md`, `ARCHITECTURE.md`, and `CLAUDE.md` are authoritative for current behavior and financial semantics.

Examples of approved later refinements that override mockup artifacts:
- No Budget feature and no “budget remaining”. Opening money is not a budget.
- Bottom navigation is exactly: `בית | יומן | + | סיכום | הגדרות`.
- No standalone Balances, Reports, Documents, or Credit Card screen.
- No GPS/maps/location permission. Place is optional plain text only.
- Receipt is a simple photo; no OCR/document system.
- Card setup is issuer/company-first and minimal; do not require full card number/CVV/expiry/last four. Any old mockup showing Visa ••••1234 is visual placeholder content, not a data requirement.
- No Duplicate Action in V1.
- No Refund, generic Income, split-payment engine, favorites/templates/recurring actions.
- Cash Adjustment is under additional actions, not a fourth primary Add Action tab.
- Journal daily total counts EXPENSES only, never FX principal or ATM withdrawal principal.
- Reporting currency defaults to ILS but can be changed to any supported currency; this affects reporting only.
- Summary category tiles hide zero-spend categories.
- No unnecessary “show all” affordance where Journal already serves as the primary history destination.

## Reference files
- `references/approved-ui-composite.png` — approved seven-screen family and overall visual consistency.
- `references/approved-trip-setup.png` — Trip Setup visual reference.
- `references/approved-home.png` — Home visual reference.
- `references/approved-add-action.png` — Add Action visual reference.
- `references/approved-journal.png` — Journal visual reference.
- `references/approved-action-details.png` — Action Details visual reference.
- `references/approved-summary.png` — Summary visual reference.
- `references/approved-settings.png` — Settings visual reference.

If an individual reference and the composite differ slightly, prefer the individual reference for that screen while keeping the seven-screen family visually coherent. Current written requirements still override obsolete mockup content.

## Global visual rules
1. Hebrew RTL is first-class. Layout, alignment, navigation, fields, labels and cards must be tested in RTL.
2. Keep the interface calm and sparse. Do not add decorative panels, charts, badges, tabs or explanatory copy that are not required.
3. Use a coherent design system across all seven screens: spacing, radii, typography, icon weight, card treatment, input treatment and financial amount hierarchy.
4. Use the approved blue accent sparingly for primary actions, selection and navigation state.
5. Financial values must be visually scannable. Original currency is primary where relevant; reporting equivalent is secondary.
6. Negative cash balance must be clearly red. Positive/received cash may use the approved positive treatment. Do not rely on color alone for meaning.
7. Preserve generous touch targets and readable text. Do not shrink controls merely to imitate a screenshot.
8. Do not hardcode one phone size. Reproduce the approved composition responsively across supported Android sizes.
9. Do not embed mockup images as the app UI. Implement native React Native components.
10. Do not copy mockup status bars, phone frames, watermarks, or generator artifacts into the app.

## Screen 1 — Trip Setup
Visual intent: travel-photo header, strong `טיול חדש` title, compact form below, opening balances as a clear currency list, one dominant Start Trip CTA.

Current content requirements:
- Trip name.
- Start/end dates.
- Reporting currency defaults to ILS and is changeable.
- Opening cash balances by currency, optional.
- Add currency.
- Approximate starting equivalent based on available opening-date/reference rates; clearly approximate, never treated as actual ILS cash.
- Same screen is reused for editing a trip.

Do not add onboarding pages before this screen.

## Screen 2 — Home
Visual intent: travel context at top, `הכסף שלי` as the main information block, currency cards with opening/current balance, compact spend summaries, recent activity, dominant universal Add action, fixed bottom nav.

Current semantic requirements:
- Opening balance is historical reference.
- Current cash balance is ledger-derived.
- Credit expenses count as spending but do not reduce cash.
- ATM withdrawal increases cash and is not an expense.
- FX exchange changes cash composition and is not an expense.
- Negative cash balance is allowed and shown clearly in red with corrective guidance.
- Avoid redundant standalone balances navigation.

## Screen 3 — Add Action
Visual intent: one adaptive screen with three primary action choices at the top:
`הוצאה | המרת מטבע | משיכת מזומן`.

### Expense mode
Fast path: amount → category → payment method → save. Currency/payment defaults may be preselected from last use. Date/time default to now. Advanced details contain optional place, note and receipt photo.

### FX Exchange mode
Enter currency/amount given and currency/actual amount received. Derive effective rate. It is not an expense. Apply both cash ledger effects atomically.

### ATM Withdrawal mode
Primary fact is actual cash received and currency. Select card when card-funded. Show estimated card/reporting cost when available, optional local ATM fee, and allow actual charge to be updated later. Withdrawal principal is not an expense.

### Additional actions
Cash Adjustment lives under `פעולות נוספות`; it is not a fourth primary tab.

## Screen 4 — Journal
Visual intent: simple searchable chronological ledger, newest first, grouped by day, compact rows, clear type/category icons and amounts.

Requirements:
- Search in the Journal itself; no separate search screen.
- Filters: category, transaction type, payment method.
- Daily total = expenses only.
- No advanced sorting system in V1.
- Category tile navigation opens Journal already filtered to that category.

## Screen 5 — Action Details
Visual intent: a polished read view of one action with clear amount/type at top and grouped details below, with Edit available without clutter.

Adaptive content by transaction type:
- Expense: amount, date/time, category, payment method/card, conversion/reporting equivalent, optional photo, place/note.
- Withdrawal: received cash, card, FX/card-cost estimate, actual charge when known, optional ATM fee.
- Exchange: given amount, received amount, effective rate.
- Cash adjustment: adjustment amount/reason/context as applicable.

Delete is soft delete internally. No Duplicate Action.

## Screen 6 — Summary
Visual intent: high-level trip spending dashboard, not another balances screen. Use concise metric cards and category tiles; avoid chart clutter.

Requirements:
- Total trip cost in selected reporting currency.
- Spending during trip period as a distinct concept where useful.
- Today.
- Average/day using approved trip-period semantics.
- Category breakdown; zero-spend categories hidden.
- Cash vs credit breakdown.
- Category tile → filtered Journal.
- No budget remaining and no inference that opening cash is a budget.
- Brief cash balance context may appear only if it does not confuse cash with spending.

## Screen 7 — Settings
Visual intent: simple grouped settings, not a dense administration panel.

Requirements:
- Edit trip → reuse Trip Setup.
- Minimal card issuer/company configuration; only ask additional card classification when materially required for rules.
- Reporting currency setting.
- Optional device biometric/device-credential lock.
- Professional PDF export via Android share/save flow.
- No direct Google Drive account integration.
- No country setting as a core financial control.

## Bottom navigation
Persistent destinations are exactly:
`בית | יומן | ＋ | סיכום | הגדרות`

The central `＋` is the universal event-entry point. Trip Setup and Action Details are contextual and are not persistent bottom-nav destinations.

**Approved extension (2026-10-09, ADR-0013):** `בית | יומן | ＋ | מסמכים | סיכום | הגדרות`. The Documents screen has no reference PNG; it uses this visual system (compact photo header, rounded list card, blue primary action).

## Implementation verification
A UI step cannot be marked PASS from tests alone. For each screen milestone:
1. Inspect the relevant approved PNG before implementation.
2. Implement the screen with current product semantics.
3. Run automated checks.
4. Render on Android/emulator at a representative phone size.
5. Compare hierarchy, spacing, component placement, RTL behavior and visual language against the reference.
6. Correct material deviations before PASS.

At final UI QA, compare all seven screens together against `approved-ui-composite.png` to ensure they look like one coherent product.
