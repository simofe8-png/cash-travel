import type { ReceiptRepository } from '../application/ports/ReceiptRepository';
import type { SqlDatabase } from '../application/ports/SqlDatabase';

/** Receipt references. Receipts are not financial records (no ledger effect). */
export class SqliteReceiptRepository implements ReceiptRepository {
  constructor(private readonly db: SqlDatabase) {}

  fileFor(transactionId: number): string | null {
    return this.db.get<{ file_name: string }>('SELECT file_name FROM receipts WHERE transaction_id = ?', [transactionId])?.file_name ?? null;
  }

  set(transactionId: number, fileName: string, now: string): string | null {
    const previous = this.fileFor(transactionId);
    this.db.run(
      `INSERT INTO receipts (transaction_id, file_name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(transaction_id) DO UPDATE SET file_name = excluded.file_name, created_at = excluded.created_at`,
      [transactionId, fileName, now],
    );
    return previous;
  }

  remove(transactionId: number): string | null {
    const previous = this.fileFor(transactionId);
    this.db.run('DELETE FROM receipts WHERE transaction_id = ?', [transactionId]);
    return previous;
  }

  removeByFile(fileName: string): number {
    return this.db.run('DELETE FROM receipts WHERE file_name = ?', [fileName]).changes;
  }

  allFileNames(): string[] {
    return this.db.all<{ file_name: string }>('SELECT file_name FROM receipts').map((r) => r.file_name);
  }

  ofDeletedTransactions(): { transactionId: number; fileName: string }[] {
    return this.db
      .all<{ transaction_id: number; file_name: string }>(
        'SELECT r.transaction_id, r.file_name FROM receipts r JOIN transactions t ON t.id = r.transaction_id WHERE t.deleted_at IS NOT NULL',
      )
      .map((r) => ({ transactionId: r.transaction_id, fileName: r.file_name }));
  }
}
