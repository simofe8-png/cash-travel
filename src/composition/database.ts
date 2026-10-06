import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { migrate, type MigrationReport } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import { ExpoSqliteDatabase } from '../infrastructure/sqlite/ExpoSqliteDatabase';

export const DATABASE_NAME = 'cashtravel.db';

/** Opens the app-private database and brings its schema up to date. */
export function openAppDatabase(): { db: SqlDatabase; report: MigrationReport } {
  const db = new ExpoSqliteDatabase(DATABASE_NAME);
  db.exec('PRAGMA journal_mode = WAL');
  const report = migrate(db, MIGRATIONS, () => new Date().toISOString());
  return { db, report };
}
