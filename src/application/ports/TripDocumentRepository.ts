import type { DocumentMimeType } from '../../domain/document';

export interface TripDocument {
  readonly id: number;
  readonly tripId: number;
  /** Bare file name inside the app-private documents directory. */
  readonly fileName: string;
  /** Name of the file the user imported (or of the camera capture). */
  readonly originalName: string;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly sizeBytes: number;
  /** ISO instant. */
  readonly createdAt: string;
}

export type NewTripDocument = Omit<TripDocument, 'id'>;

/** Trip document metadata. Not financial data (no ledger effect). */
export interface TripDocumentRepository {
  add(doc: NewTripDocument): number;
  get(id: number): TripDocument | undefined;
  /** Newest first. */
  listForTrip(tripId: number): TripDocument[];
  rename(id: number, displayName: string): void;
  /** Removes the row; returns its file name, if any. */
  remove(id: number): string | null;
  /** Removes every document row of a trip; returns their file names. */
  removeForTrip(tripId: number): string[];
  allFileNames(): string[];
}
