import type { Clock } from '../ports/Clock';
import type { ReceiptRepository } from '../ports/ReceiptRepository';
import type { ReceiptCamera, ReceiptStore } from '../ports/ReceiptStore';
import type { UnitOfWork } from '../ports/UnitOfWork';

/** Files without a DB reference younger than this are left alone (an attach may be in progress). */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export interface CleanupReport {
  readonly orphanFilesDeleted: number;
  readonly deletedTransactionReceipts: number;
  readonly danglingRowsRemoved: number;
}

/**
 * Receipt photo lifecycle. Order of operations keeps DB and files consistent:
 * attach = copy file → write row atomically → delete the replaced file after commit;
 * a failed row write deletes the new file. Remove = delete row → delete file.
 * Anything left behind by a crash is reconciled by `cleanup`.
 */
export class ReceiptService {
  constructor(
    private readonly repo: ReceiptRepository,
    private readonly store: ReceiptStore,
    private readonly camera: ReceiptCamera,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  capture(): ReturnType<ReceiptCamera['capture']> {
    return this.camera.capture();
  }

  uriFor(transactionId: number): string | null {
    const f = this.repo.fileFor(transactionId);
    return f && this.store.exists(f) ? this.store.uriOf(f) : null;
  }

  async attach(transactionId: number, tempUri: string): Promise<void> {
    const fileName = await this.store.importFrom(tempUri);
    let previous: string | null;
    try {
      previous = this.uow.run(() => this.repo.set(transactionId, fileName, this.clock.now()));
    } catch (e) {
      this.store.remove(fileName);
      throw e;
    }
    if (previous && previous !== fileName) this.store.remove(previous);
  }

  /** Deletes photo files whose rows were already removed in a committed transaction (best effort). */
  deleteFiles(fileNames: readonly string[]): void {
    for (const f of fileNames) {
      try {
        this.store.remove(f);
      } catch {
        // Left for `cleanup` (unreferenced files are removed after the grace period).
      }
    }
  }

  remove(transactionId: number): void {
    const previous = this.uow.run(() => this.repo.remove(transactionId));
    if (previous) this.store.remove(previous);
  }

  /**
   * Safe reconciliation (startup): deletes receipts of soft-deleted transactions, rows whose file is
   * missing, and unreferenced files older than the grace period. Never touches financial data.
   */
  cleanup(): CleanupReport {
    let deletedTransactionReceipts = 0;
    for (const r of this.repo.ofDeletedTransactions()) {
      this.remove(r.transactionId);
      deletedTransactionReceipts++;
    }
    let danglingRowsRemoved = 0;
    for (const name of this.repo.allFileNames()) {
      // A row pointing to a missing file (e.g. storage cleared) is dropped so the UI never shows a broken photo.
      if (!this.store.exists(name)) danglingRowsRemoved += this.uow.run(() => this.repo.removeByFile(name));
    }
    const now = Date.parse(this.clock.now());
    let orphanFilesDeleted = 0;
    const live = new Set(this.repo.allFileNames());
    for (const f of this.store.listFiles()) {
      if (live.has(f.name)) continue;
      if (f.modifiedMs !== null && now - f.modifiedMs < ORPHAN_GRACE_MS) continue;
      this.store.remove(f.name);
      orphanFilesDeleted++;
    }
    return { orphanFilesDeleted, deletedTransactionReceipts, danglingRowsRemoved };
  }
}
