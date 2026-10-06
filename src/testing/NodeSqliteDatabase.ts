// Test-only implementation of the SqlDatabase port over Node's built-in SQLite (node:sqlite).
// Real SQLite semantics (constraints, FKs, transactions) without a native device.
import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlRunResult, SqlValue } from '../application/ports/SqlDatabase';

export class NodeSqliteDatabase implements SqlDatabase {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: readonly SqlValue[] = []): SqlRunResult {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    const row = this.db.prepare(sql).get(...params);
    return row === undefined ? undefined : ({ ...row } as T);
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    return this.db.prepare(sql).all(...params).map((r) => ({ ...r }) as T);
  }

  close(): void {
    this.db.close();
  }
}
