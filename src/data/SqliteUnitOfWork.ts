import type { SqlDatabase } from '../application/ports/SqlDatabase';
import type { UnitOfWork } from '../application/ports/UnitOfWork';
import { inTransaction } from './db/transaction';

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: SqlDatabase) {}

  run<T>(work: () => T): T {
    return inTransaction(this.db, work);
  }
}
