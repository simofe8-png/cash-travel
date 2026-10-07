import type { Migration } from '../migrate';

/**
 * Whole-trip deletion (owner request, ADR-0012). Individual transactions stay soft-delete-only and ledger
 * entries stay immutable; the delete-blocking triggers gain one exception: rows of a trip that is being
 * purged inside the same SQLite transaction (marked in `trip_purges`, which the purge clears again).
 */
export const m0002TripPurge: Migration = {
  version: 2,
  name: 'trip_purge',
  up: (db) =>
    db.exec(`
CREATE TABLE trip_purges (
  trip_id INTEGER PRIMARY KEY
) STRICT;

DROP TRIGGER trg_le_immutable_delete;
CREATE TRIGGER trg_le_immutable_delete BEFORE DELETE ON ledger_entries
WHEN NOT EXISTS (
  SELECT 1 FROM trip_purges p JOIN transactions t ON t.trip_id = p.trip_id WHERE t.id = OLD.transaction_id
)
BEGIN SELECT RAISE(ABORT, 'ledger entries are immutable'); END;

DROP TRIGGER trg_tx_no_hard_delete;
CREATE TRIGGER trg_tx_no_hard_delete BEFORE DELETE ON transactions
WHEN NOT EXISTS (SELECT 1 FROM trip_purges WHERE trip_id = OLD.trip_id)
BEGIN SELECT RAISE(ABORT, 'transactions are soft-deleted only'); END;
`),
};
