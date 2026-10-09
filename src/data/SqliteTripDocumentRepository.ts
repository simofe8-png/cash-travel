import type { SqlDatabase } from '../application/ports/SqlDatabase';
import type { NewTripDocument, TripDocument, TripDocumentRepository } from '../application/ports/TripDocumentRepository';
import type { DocumentMimeType } from '../domain/document';

interface Row {
  id: number;
  trip_id: number;
  file_name: string;
  original_name: string;
  display_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

const toDoc = (r: Row): TripDocument => ({
  id: r.id,
  tripId: r.trip_id,
  fileName: r.file_name,
  originalName: r.original_name,
  displayName: r.display_name,
  mimeType: r.mime_type as DocumentMimeType,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
});

/** Trip document metadata. Documents are not financial records (no ledger effect). */
export class SqliteTripDocumentRepository implements TripDocumentRepository {
  constructor(private readonly db: SqlDatabase) {}

  add(d: NewTripDocument): number {
    return this.db.run(
      `INSERT INTO trip_documents (trip_id, file_name, original_name, display_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [d.tripId, d.fileName, d.originalName, d.displayName, d.mimeType, d.sizeBytes, d.createdAt],
    ).lastInsertRowId;
  }

  get(id: number): TripDocument | undefined {
    const r = this.db.get<Row>('SELECT * FROM trip_documents WHERE id = ?', [id]);
    return r ? toDoc(r) : undefined;
  }

  listForTrip(tripId: number): TripDocument[] {
    return this.db.all<Row>('SELECT * FROM trip_documents WHERE trip_id = ? ORDER BY created_at DESC, id DESC', [tripId]).map(toDoc);
  }

  rename(id: number, displayName: string): void {
    this.db.run('UPDATE trip_documents SET display_name = ? WHERE id = ?', [displayName, id]);
  }

  remove(id: number): string | null {
    const f = this.db.get<{ file_name: string }>('SELECT file_name FROM trip_documents WHERE id = ?', [id])?.file_name ?? null;
    this.db.run('DELETE FROM trip_documents WHERE id = ?', [id]);
    return f;
  }

  removeForTrip(tripId: number): string[] {
    const files = this.db.all<{ file_name: string }>('SELECT file_name FROM trip_documents WHERE trip_id = ?', [tripId]).map((r) => r.file_name);
    this.db.run('DELETE FROM trip_documents WHERE trip_id = ?', [tripId]);
    return files;
  }

  allFileNames(): string[] {
    return this.db.all<{ file_name: string }>('SELECT file_name FROM trip_documents').map((r) => r.file_name);
  }
}
