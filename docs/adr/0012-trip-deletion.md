# ADR-0012 — Whole-trip deletion

## Status
Accepted (2026-10-07, owner request).

## Decision
Settings → Trip details → "מחיקת הטיול" permanently deletes a trip and all data that belongs only to it, after a
destructive confirmation ("מחיקת הטיול תמחק את כל הפעולות, היתרות והתמונות השייכות אליו. לא ניתן לבטל פעולה זו.").

- `TripService.deleteTrip(id)` runs one SQLite transaction (UnitOfWork): receipt rows (`ReceiptRepository.removeForTrip`)
  → `LedgerRepository.purgeTrip` (transaction_history, card_charges, ledger_entries, transactions, cash_wallets — the
  Ledger Engine stays the only writer of financial tables) → trip row → current-trip setting. Receipt photo files are
  deleted after commit (purge hook → `ReceiptService.deleteFiles`); leftovers are reaped by receipt cleanup.
- Migration 0002 (`trip_purge`): the two delete-blocking triggers gain a single exception — rows of a trip marked in
  `trip_purges` during the purge (the marker is removed in the same transaction). Individual transactions remain
  soft-delete-only and ledger entries immutable at all other times (tested).
- Not deleted (not trip-exclusive): cards, categories, FX rate cache, app settings.
- After deletion the app switches to another trip (date-based default) or, if none remains, to Trip Setup.

## Consequences
- Irreversible by design (owner-confirmed). The automatic pre-upgrade database snapshot taken before a schema upgrade
  (ADR-0003) can still contain trips that existed at that moment.
- Migration 0002 is JavaScript-only (no native change): delivered by OTA; the app snapshots the DB before applying it.
