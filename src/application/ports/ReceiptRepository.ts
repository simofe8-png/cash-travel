export interface ReceiptRepository {
  fileFor(transactionId: number): string | null;
  /** Sets the receipt of a transaction; returns the previous file name, if any. */
  set(transactionId: number, fileName: string, now: string): string | null;
  /** Removes the receipt row; returns the removed file name, if any. */
  remove(transactionId: number): string | null;
  /** Removes rows referencing a file name; returns the number removed. */
  removeByFile(fileName: string): number;
  allFileNames(): string[];
  /** Removes the receipt rows of every transaction of a trip; returns their file names. */
  removeForTrip(tripId: number): string[];
  /** Receipts whose transaction has been soft-deleted. */
  ofDeletedTransactions(): { transactionId: number; fileName: string }[];
}
