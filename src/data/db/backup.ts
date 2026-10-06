import type { SqlDatabase } from '../../application/ports/SqlDatabase';
import { currentSchemaVersion, type Migration } from './migrate';

/** Whether opening this database will apply migrations to existing data. */
export function needsUpgrade(db: SqlDatabase, migrations: readonly Migration[]): boolean {
  const v = currentSchemaVersion(db);
  return v > 0 && v < migrations.length;
}

/**
 * Writes a consistent, compacted copy of the whole database to `targetPath` (SQLite VACUUM INTO),
 * used as a safety snapshot before schema upgrades. Overwrites nothing: the target must not exist.
 */
export function backupDatabase(db: SqlDatabase, targetPath: string): void {
  db.exec(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);
}
