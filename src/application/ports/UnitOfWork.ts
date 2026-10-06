/** Runs a synchronous unit of work atomically across repositories (one SQLite transaction). */
export interface UnitOfWork {
  run<T>(work: () => T): T;
}
