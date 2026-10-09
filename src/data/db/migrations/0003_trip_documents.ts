import type { Migration } from '../migrate';

/**
 * Trip documents (owner request, ADR-0013). Metadata only — the files live in app-private storage
 * (`<documents>/documents/<file_name>`; a bare name, never an absolute path, because the app's
 * container path is not stable). Not financial data: no ledger effect.
 */
export const m0003TripDocuments: Migration = {
  version: 3,
  name: 'trip_documents',
  up: (db) =>
    db.exec(`
CREATE TABLE trip_documents (
  id            INTEGER PRIMARY KEY,
  trip_id       INTEGER NOT NULL REFERENCES trips(id),
  file_name     TEXT NOT NULL UNIQUE CHECK (file_name NOT LIKE '%/%' AND file_name NOT LIKE '%\\%' AND file_name NOT LIKE '%..%'),
  original_name TEXT NOT NULL,
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  mime_type     TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX ix_documents_trip ON trip_documents(trip_id, created_at);
`),
};
