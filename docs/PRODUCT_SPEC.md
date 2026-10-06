# Cash Travel — Product Specification — V1

## Vision
Cash Travel is a very simple travel-money app that lets a traveler know physical cash balances, trip spending, payment method, currency exchanges, ATM withdrawals, and total trip cost without exposing accounting complexity.

UX principle: **simple like a notebook; accurate like a ledger**.

## Platform and language
Android-first V1. Hebrew RTL. Architecture must not block later iOS support.

## Seven-screen structure
1. **Trip Setup** — create/edit trip, name, dates, default reporting currency (ILS), opening cash balances by currency, approximate starting equivalent.
2. **Home** — trip context, day/date information, cash wallet cards with opening/current balances, today spending, trip-to-date spending, recent actions, universal Add button.
3. **Add Action** — adaptive entry for Expense, FX Exchange, ATM Withdrawal; Cash Adjustment under additional actions.
4. **Journal** — chronological history, newest first, grouped by day, local search and simple filters.
5. **Action Details** — adaptive details/edit/soft-delete for the selected transaction.
6. **Summary** — total trip cost, during-trip spending, today, average/day where valid, category tiles, cash-vs-credit; no budget.
7. **Settings** — trip editing entry, card issuer configuration, reporting currency, optional device lock, PDF export.

Bottom navigation: Home | Journal | + | Summary | Settings. Trip Setup and Action Details are contextual.

## Fast expense flow
Normal expense should usually be: amount → category → payment method → save. Date/time default to now. Last-used transaction currency and payment method are remembered per trip. Last-used card may be remembered. Optional place, note and receipt photo live under advanced details.

## Multiple trips
V1 supports multiple current/future/completed trips. UI uses one Current Trip context at a time. Completed trips remain editable. Trip selection should use contextual UI rather than an eighth top-level screen.

## Categories
Built-ins: Food, Accommodation, Transportation, Entertainment/Attractions, Shopping, Other. Hebrew labels are used in UI. Custom categories persist locally. Zero-spend categories are hidden in summary. Deleting a used custom category requires reassignment, defaulting to Other where appropriate.

Category tile → Journal filtered to category → Action Details.

## Journal
Newest first, grouped by `occurred_at` day. Daily totals count EXPENSE transactions only. Search textual description/place/note. Filters: category, transaction type, payment method. No separate search screen and no advanced sort system in V1.

## Receipts and location
Receipt support is simple photo capture/preview/replace/delete in app-private storage. No OCR, PDF receipt import, document manager, or parsing. Place is optional plain text. No GPS/location permission/maps/tracking.

## Credit cards
Minimal setup: issuer/company such as Isracard, MAX, CAL, Other. Ask one additional classification only when materially required for correct rules; allow “unknown”. Never request full card number, CVV, expiry, or last four digits merely for identification.

Card purchase stores original transaction amount/currency and estimated reporting-currency charge when possible. Later actual charge can be entered; preserve estimate and actual, with reporting preferring actual when known. DCC is explained in plain language via “charged in another currency”.

## ATM
Primary fact: actual physical cash received. Withdrawal increases that cash wallet and is not itself an expense. Card-funded withdrawal may have an estimated card cost and later actual charge. Optional local ATM fee is separate.

## FX exchange
Record actual amount/currency given and actual amount/currency received. Derive effective rate. No separate exchange-counter fee field in V1.

## Reporting currency
Default is ILS. User may change to any supported currency. Changing reporting currency affects reporting/presentation only; original transactions and ledger never change.

## Budget
There is no budget feature in V1. Opening money is not a budget. Never show inferred “budget remaining”.

## Negative cash
Do not block a cash expense that makes a wallet negative. Show the negative balance clearly in red and explain that a conversion, withdrawal, or missing prior action may be needed. Offer contextual quick actions in-app. No proactive low-balance notification in V1.

## Export
One professional trip-summary PDF. Android share/save UI lets the user choose Drive, Files, WhatsApp, email, etc. No direct Drive integration. No CSV/Excel. PDF is a report, not a restorable database backup. Receipt photos are not embedded by default.

## Explicitly out of V1
Account/backend/cloud sync; GPS/maps; OCR/document management; budget; generic income; refunds; dedicated split-payment flow; favorite/template/recurring/duplicate actions; direct Drive integration; Excel/CSV export.
