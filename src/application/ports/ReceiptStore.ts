/** App-private receipt photo storage. File names are bare (no paths). */
export interface ReceiptStore {
  /** Copies a captured temporary image into private storage; returns the new file name. */
  importFrom(tempUri: string): Promise<string>;
  /** Deletes a stored file; missing files are ignored. */
  remove(fileName: string): void;
  /** Displayable URI of a stored file. */
  uriOf(fileName: string): string;
  /** Stored files with modification time (ms since epoch) when known. */
  listFiles(): { name: string; modifiedMs: number | null }[];
  exists(fileName: string): boolean;
}

/** Camera capture (permission requested only when invoked). */
export interface ReceiptCamera {
  capture(): Promise<{ status: 'captured'; uri: string } | { status: 'cancelled' } | { status: 'denied' }>;
}
