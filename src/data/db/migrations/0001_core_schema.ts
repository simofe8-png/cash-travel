import type { Migration } from '../migrate';

/**
 * Core V1 schema (ADR-0003). All tables are STRICT. Money is INTEGER minor units; rates are
 * canonical decimal TEXT; instants are ISO-8601 UTC TEXT; date-only values are 'YYYY-MM-DD'.
 */
export const m0001CoreSchema: Migration = {
  version: 1,
  name: 'core_schema',
  up: (db) => {
    db.exec(`
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE trips (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  start_date          TEXT NOT NULL CHECK (date(start_date) IS start_date),
  end_date            TEXT NOT NULL CHECK (date(end_date) IS end_date),
  reporting_currency  TEXT NOT NULL DEFAULT 'ILS' CHECK (length(reporting_currency) = 3),
  last_currency       TEXT CHECK (last_currency IS NULL OR length(last_currency) = 3),
  last_payment_method TEXT CHECK (last_payment_method IS NULL OR last_payment_method IN ('CASH', 'CARD')),
  last_card_id        INTEGER REFERENCES cards(id),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (end_date >= start_date)
) STRICT;

CREATE TABLE cash_wallets (
  id         INTEGER PRIMARY KEY,
  trip_id    INTEGER NOT NULL REFERENCES trips(id),
  currency   TEXT NOT NULL CHECK (length(currency) = 3),
  created_at TEXT NOT NULL,
  UNIQUE (trip_id, currency)
) STRICT;

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  builtin_key TEXT UNIQUE CHECK (builtin_key IS NULL OR builtin_key IN
                ('FOOD', 'ACCOMMODATION', 'TRANSPORT', 'ENTERTAINMENT', 'SHOPPING', 'OTHER')),
  name        TEXT CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 40),
  icon        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  -- Built-ins are labeled by key (Hebrew label in UI) and can never be archived; custom ones need a name.
  CHECK ((builtin_key IS NOT NULL AND archived_at IS NULL) OR (builtin_key IS NULL AND name IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX ux_categories_custom_name ON categories(name) WHERE builtin_key IS NULL AND archived_at IS NULL;

CREATE TABLE cards (
  id               INTEGER PRIMARY KEY,
  issuer           TEXT NOT NULL CHECK (issuer IN ('ISRACARD', 'MAX', 'CAL', 'OTHER')),
  classification   TEXT NOT NULL DEFAULT 'UNKNOWN',
  nickname         TEXT CHECK (nickname IS NULL OR length(trim(nickname)) BETWEEN 1 AND 30),
  billing_currency TEXT NOT NULL DEFAULT 'ILS' CHECK (length(billing_currency) = 3),
  archived_at      TEXT,
  created_at       TEXT NOT NULL
) STRICT;

CREATE TABLE transactions (
  id                  INTEGER PRIMARY KEY,
  trip_id             INTEGER NOT NULL REFERENCES trips(id),
  type                TEXT NOT NULL CHECK (type IN
                        ('OPENING_BALANCE', 'EXPENSE', 'FX_EXCHANGE', 'ATM_WITHDRAWAL', 'CASH_ADJUSTMENT')),
  occurred_at         TEXT NOT NULL,
  occurred_local_date TEXT NOT NULL CHECK (date(occurred_local_date) IS occurred_local_date),
  tz_offset_min       INTEGER NOT NULL CHECK (tz_offset_min BETWEEN -840 AND 840),
  -- Primary original amount: expense amount / opening amount / ATM cash received /
  -- signed adjustment delta / FX amount given.
  amount_minor        INTEGER NOT NULL,
  currency            TEXT NOT NULL CHECK (length(currency) = 3),
  -- FX_EXCHANGE only: actual amount received.
  counter_amount_minor INTEGER,
  counter_currency    TEXT,
  category_id         INTEGER REFERENCES categories(id),
  payment_method      TEXT CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'CARD')),
  card_id             INTEGER REFERENCES cards(id),
  -- ATM_WITHDRAWAL only: optional local ATM fee, in the cash currency.
  fee_minor           INTEGER CHECK (fee_minor IS NULL OR fee_minor >= 0),
  description         TEXT CHECK (description IS NULL OR length(description) <= 120),
  place               TEXT CHECK (place IS NULL OR length(place) <= 120),
  note                TEXT CHECK (note IS NULL OR length(note) <= 500),
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  CHECK (CASE type
    WHEN 'EXPENSE' THEN amount_minor > 0 AND category_id IS NOT NULL AND payment_method IS NOT NULL
      AND counter_amount_minor IS NULL AND fee_minor IS NULL
      AND (payment_method = 'CARD' OR card_id IS NULL)
    WHEN 'OPENING_BALANCE' THEN amount_minor > 0 AND category_id IS NULL AND payment_method IS NULL
      AND card_id IS NULL AND counter_amount_minor IS NULL AND fee_minor IS NULL
    WHEN 'FX_EXCHANGE' THEN amount_minor > 0 AND counter_amount_minor > 0 AND counter_currency IS NOT NULL
      AND counter_currency <> currency AND category_id IS NULL AND payment_method IS NULL
      AND card_id IS NULL AND fee_minor IS NULL
    WHEN 'ATM_WITHDRAWAL' THEN amount_minor > 0 AND category_id IS NULL AND payment_method IS NULL
      AND counter_amount_minor IS NULL
    WHEN 'CASH_ADJUSTMENT' THEN amount_minor <> 0 AND category_id IS NULL AND payment_method IS NULL
      AND card_id IS NULL AND counter_amount_minor IS NULL AND fee_minor IS NULL
  END),
  CHECK ((counter_amount_minor IS NULL) = (counter_currency IS NULL))
) STRICT;
CREATE INDEX ix_tx_trip_active_time ON transactions(trip_id, deleted_at, occurred_at DESC);
CREATE INDEX ix_tx_trip_type_date ON transactions(trip_id, type, occurred_local_date);
CREATE INDEX ix_tx_category ON transactions(category_id);
CREATE INDEX ix_tx_card ON transactions(card_id);

-- Physical cash effects. Entries are immutable; an edit writes a new revision of entries and the
-- active set is the one matching the parent's current revision (older revisions remain for audit).
CREATE TABLE ledger_entries (
  id             INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  revision       INTEGER NOT NULL CHECK (revision >= 1),
  wallet_id      INTEGER NOT NULL REFERENCES cash_wallets(id),
  amount_minor   INTEGER NOT NULL CHECK (amount_minor <> 0),
  created_at     TEXT NOT NULL
) STRICT;
CREATE INDEX ix_le_tx_rev ON ledger_entries(transaction_id, revision);
CREATE INDEX ix_le_wallet ON ledger_entries(wallet_id);

CREATE TRIGGER trg_le_wallet_same_trip BEFORE INSERT ON ledger_entries
WHEN (SELECT trip_id FROM cash_wallets WHERE id = NEW.wallet_id)
     IS NOT (SELECT trip_id FROM transactions WHERE id = NEW.transaction_id)
BEGIN SELECT RAISE(ABORT, 'ledger entry wallet belongs to another trip'); END;

CREATE TRIGGER trg_le_immutable_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger entries are immutable'); END;

CREATE TRIGGER trg_le_immutable_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger entries are immutable'); END;

CREATE TRIGGER trg_tx_no_hard_delete BEFORE DELETE ON transactions
BEGIN SELECT RAISE(ABORT, 'transactions are soft-deleted only'); END;

CREATE TRIGGER trg_tx_type_immutable BEFORE UPDATE OF type, trip_id ON transactions
WHEN NEW.type IS NOT OLD.type OR NEW.trip_id IS NOT OLD.trip_id
BEGIN SELECT RAISE(ABORT, 'transaction type and trip are immutable'); END;

-- Card cost of a card-paid expense or card-funded ATM withdrawal: estimate and actual kept separately.
CREATE TABLE card_charges (
  transaction_id        INTEGER PRIMARY KEY REFERENCES transactions(id),
  billing_currency      TEXT NOT NULL CHECK (length(billing_currency) = 3),
  -- "Charged in another currency" (DCC): the currency/amount the merchant actually charged.
  charged_currency      TEXT NOT NULL CHECK (length(charged_currency) = 3),
  charged_amount_minor  INTEGER CHECK (charged_amount_minor IS NULL OR charged_amount_minor > 0),
  estimate_status       TEXT NOT NULL CHECK (estimate_status IN ('ESTIMATED', 'UNAVAILABLE')),
  estimate_minor        INTEGER CHECK (estimate_minor IS NULL OR estimate_minor > 0),
  estimate_fee_status   TEXT NOT NULL CHECK (estimate_fee_status IN ('INCLUDED', 'NONE', 'UNKNOWN')),
  estimate_rate         TEXT,
  estimate_rate_source  TEXT,
  estimate_rate_date    TEXT,
  rule_set_version      TEXT,
  rule_id               TEXT,
  estimated_at          TEXT,
  actual_minor          INTEGER CHECK (actual_minor IS NULL OR actual_minor > 0),
  actual_entered_at     TEXT,
  CHECK ((estimate_status = 'ESTIMATED') = (estimate_minor IS NOT NULL)),
  CHECK ((actual_minor IS NULL) = (actual_entered_at IS NULL))
) STRICT;

CREATE TABLE transaction_history (
  id             INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  revision       INTEGER NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('CREATE', 'EDIT', 'DELETE', 'ACTUAL_CHARGE')),
  snapshot       TEXT NOT NULL CHECK (json_valid(snapshot)),
  changed_at     TEXT NOT NULL
) STRICT;
CREATE INDEX ix_history_tx ON transaction_history(transaction_id);

-- Cached reference (market) rates with provenance: 1 base = rate quote, effective on rate_date.
CREATE TABLE fx_rates (
  id         INTEGER PRIMARY KEY,
  source     TEXT NOT NULL,
  base       TEXT NOT NULL CHECK (length(base) = 3),
  quote      TEXT NOT NULL CHECK (length(quote) = 3),
  rate       TEXT NOT NULL CHECK (CAST(rate AS REAL) > 0),
  rate_date  TEXT NOT NULL CHECK (date(rate_date) IS rate_date),
  fetched_at TEXT NOT NULL,
  UNIQUE (source, base, quote, rate_date)
) STRICT;
CREATE INDEX ix_fx_lookup ON fx_rates(base, quote, rate_date);

-- Versioned card-cost rule sets (data-driven, never hardcoded in business logic).
CREATE TABLE card_rule_sets (
  version        TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (date(effective_from) IS effective_from),
  payload        TEXT NOT NULL CHECK (json_valid(payload)),
  loaded_at      TEXT NOT NULL
) STRICT;

CREATE TABLE receipts (
  id             INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
  file_name      TEXT NOT NULL UNIQUE CHECK (file_name NOT LIKE '%/%' AND file_name NOT LIKE '%..%'),
  created_at     TEXT NOT NULL
) STRICT;
`);
    const seed = [
      ['FOOD', 'food', 1],
      ['ACCOMMODATION', 'bed', 2],
      ['TRANSPORT', 'bus', 3],
      ['ENTERTAINMENT', 'ticket', 4],
      ['SHOPPING', 'bag', 5],
      ['OTHER', 'dots', 99],
    ] as const;
    for (const [key, icon, order] of seed) {
      db.run(
        "INSERT INTO categories (builtin_key, icon, sort_order, created_at) VALUES (?, ?, ?, '1970-01-01T00:00:00.000Z')",
        [key, icon, order],
      );
    }
  },
};
