import { File, Paths } from 'expo-file-system';

import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { backupDatabase, needsUpgrade } from '../data/db/backup';
import { currentSchemaVersion, migrate, type MigrationReport } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import { ExpoSqliteDatabase } from '../infrastructure/sqlite/ExpoSqliteDatabase';

export const DATABASE_NAME = 'cashtravel.db';

/**
 * Opens the app-private database and brings its schema up to date. Before upgrading existing data,
 * a snapshot is written next to the database (one per source version, kept; never overwritten).
 */
export function openAppDatabase(): { db: SqlDatabase; report: MigrationReport } {
  const db = new ExpoSqliteDatabase(DATABASE_NAME);
  db.exec('PRAGMA journal_mode = WAL');
  if (needsUpgrade(db, MIGRATIONS)) {
    const target = new File(Paths.document, 'SQLite', `cashtravel.pre-upgrade-v${currentSchemaVersion(db)}.db`);
    if (!target.exists) backupDatabase(db, target.uri.replace(/^file:\/\//, ''));
  }
  const report = migrate(db, MIGRATIONS, () => new Date().toISOString());
  return { db, report };
}
