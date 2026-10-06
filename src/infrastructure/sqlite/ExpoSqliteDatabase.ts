import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase, SqlRunResult, SqlValue } from '../../application/ports/SqlDatabase';

/** Device implementation of the SqlDatabase port over expo-sqlite's synchronous API. */
export class ExpoSqliteDatabase implements SqlDatabase {
  private readonly db: SQLiteDatabase;

  constructor(name: string) {
    this.db = openDatabaseSync(name);
  }

  exec(sql: string): void {
    this.db.execSync(sql);
  }

  run(sql: string, params: readonly SqlValue[] = []): SqlRunResult {
    const r = this.db.runSync(sql, [...params]);
    return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    return this.db.getFirstSync<T>(sql, [...params]) ?? undefined;
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    return this.db.getAllSync<T>(sql, [...params]);
  }

  close(): void {
    this.db.closeSync();
  }
}
