/**
 * Minimal synchronous SQL port. The data layer is written against this interface only; the
 * infrastructure layer provides it with expo-sqlite (device) or node:sqlite (tests), so the
 * exact same SQL and transaction code runs in both.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  /** Executes one or more statements without parameters (DDL, PRAGMA). */
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): SqlRunResult;
  get<T>(sql: string, params?: readonly SqlValue[]): T | undefined;
  all<T>(sql: string, params?: readonly SqlValue[]): T[];
  close(): void;
}
