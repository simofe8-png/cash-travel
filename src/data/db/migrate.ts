import type { SqlDatabase } from '../../application/ports/SqlDatabase';
import { inTransaction } from './transaction';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: (db: SqlDatabase) => void;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly version?: number,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export interface MigrationReport {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
}

/** Connection settings applied on every open, before migrations. */
export function configureConnection(db: SqlDatabase): void {
  db.exec('PRAGMA foreign_keys = ON');
  const fk = db.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (fk?.foreign_keys !== 1) throw new MigrationError('Foreign key enforcement could not be enabled');
}

function validate(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError(`Migrations must be numbered 1..N without gaps (found ${m.version} at index ${i})`);
    }
  });
}

export function currentSchemaVersion(db: SqlDatabase): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

/**
 * Applies pending migrations in order. Each migration and its version bump commit atomically; a
 * failing migration rolls back completely and stops the run, leaving the database at the last
 * good version (no partial schema, no data loss). A database newer than this app is never touched.
 */
export function migrate(db: SqlDatabase, migrations: readonly Migration[], now: () => string): MigrationReport {
  validate(migrations);
  configureConnection(db);
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     ) STRICT`,
  );
  const from = currentSchemaVersion(db);
  if (from > migrations.length) {
    throw new MigrationError(
      `Database schema version ${from} is newer than this app supports (${migrations.length})`,
      from,
    );
  }
  const applied: number[] = [];
  for (const m of migrations.slice(from)) {
    try {
      inTransaction(db, () => {
        m.up(db);
        db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, now()]);
        db.exec(`PRAGMA user_version = ${m.version}`);
      });
    } catch (e) {
      throw new MigrationError(`Migration ${m.version} (${m.name}) failed: ${(e as Error).message}`, m.version);
    }
    applied.push(m.version);
  }
  const fkViolations = db.all('PRAGMA foreign_key_check');
  if (fkViolations.length > 0) throw new MigrationError('Foreign key check failed after migration');
  return { from, to: currentSchemaVersion(db), applied };
}
