import type { SqlDatabase } from '../../application/ports/SqlDatabase';

const depth = new WeakMap<SqlDatabase, number>();

/**
 * Runs `fn` atomically: all of its writes commit together or none do. The outermost call uses
 * BEGIN IMMEDIATE / COMMIT; nested calls use savepoints, so a failing inner unit rolls back only
 * itself unless the error propagates (which then rolls back everything).
 */
export function inTransaction<T>(db: SqlDatabase, fn: () => T): T {
  const level = depth.get(db) ?? 0;
  const savepoint = `sp_${level}`;
  db.exec(level === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  depth.set(db, level + 1);
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error('inTransaction callback must be synchronous');
    db.exec(level === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (e) {
    if (level === 0) db.exec('ROLLBACK');
    else db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw e;
  } finally {
    depth.set(db, level);
  }
}
