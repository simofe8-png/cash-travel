import {
  DOCUMENT_EXTENSION,
  DOCUMENT_SNIFF_BYTES,
  MAX_DOCUMENT_BYTES,
  displayNameFromFileName,
  isImageDocument,
  normalizeDocumentName,
  sniffDocumentType,
  type DocumentMimeType,
} from '../../domain/document';
import { localDateOf } from '../../domain/time';
import type { Clock } from '../ports/Clock';
import type { DocumentRenderer, DocumentSource, DocumentStore, RenderedPage } from '../ports/DocumentStore';
import type { TripDocument, TripDocumentRepository } from '../ports/TripDocumentRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

/** Files without a DB reference younger than this are left alone (an import may be in progress). */
export const DOCUMENT_ORPHAN_GRACE_MS = 60 * 60 * 1000;
/** Free space kept after an import so the database and the OS can still write. */
export const DOCUMENT_STORAGE_RESERVE = 20 * 1024 * 1024;

export type DocumentImportErrorCode = 'UNSUPPORTED' | 'EMPTY' | 'TOO_LARGE' | 'NO_SPACE' | 'COPY_FAILED';

export class DocumentImportError extends Error {
  constructor(readonly code: DocumentImportErrorCode, cause?: unknown) {
    super(`Document import failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = 'DocumentImportError';
  }
}

export interface TripDocumentView extends TripDocument {
  /** Local calendar date the document was added (device offset). */
  readonly createdLocalDate: string;
  readonly isImage: boolean;
  /** False when the private file is gone (e.g. app storage cleared); the row stays so the user sees it. */
  readonly available: boolean;
}

export type ViewerContent =
  | { kind: 'pdf'; pages: { width: number; height: number }[] }
  | { kind: 'image'; page: RenderedPage };

/**
 * Trip document lifecycle (ADR-0013). Order of operations keeps DB and files consistent:
 * import = validate → copy into private storage → write row (a failed write deletes the copy);
 * delete = remove row → delete file. Documents never touch financial data.
 */
export class DocumentService {
  constructor(
    private readonly repo: TripDocumentRepository,
    private readonly store: DocumentStore,
    private readonly source: DocumentSource,
    private readonly renderer: DocumentRenderer,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  list(tripId: number): TripDocumentView[] {
    return this.repo.listForTrip(tripId).map((d) => this.view(d));
  }

  get(tripId: number, id: number): TripDocumentView | undefined {
    const d = this.repo.get(id);
    return d && d.tripId === tripId ? this.view(d) : undefined;
  }

  pickFile(): ReturnType<DocumentSource['pickFile']> {
    return this.source.pickFile();
  }

  capturePhoto(): ReturnType<DocumentSource['capturePhoto']> {
    return this.source.capturePhoto();
  }

  /**
   * Imports a picked/captured temporary file into the trip. The type comes from the file content;
   * unsupported, empty or oversized files and a full disk are rejected before anything is stored.
   */
  async importFile(tripId: number, sourceUri: string, originalName: string, displayName?: string): Promise<number> {
    let mime: DocumentMimeType | null;
    let size: number;
    try {
      mime = sniffDocumentType(await this.store.readHead(sourceUri, DOCUMENT_SNIFF_BYTES));
      size = this.store.sizeOf(sourceUri);
    } catch (e) {
      this.store.discardSource(sourceUri);
      throw new DocumentImportError('COPY_FAILED', e);
    }
    const reject = (code: DocumentImportErrorCode) => {
      this.store.discardSource(sourceUri);
      return new DocumentImportError(code);
    };
    if (size <= 0) throw reject('EMPTY');
    if (!mime) throw reject('UNSUPPORTED');
    if (size > MAX_DOCUMENT_BYTES) throw reject('TOO_LARGE');
    const free = this.store.availableBytes();
    if (free !== null && size + DOCUMENT_STORAGE_RESERVE > free) throw reject('NO_SPACE');

    let fileName: string;
    try {
      fileName = await this.store.importFrom(sourceUri, DOCUMENT_EXTENSION[mime]);
    } catch (e) {
      this.store.discardSource(sourceUri);
      throw new DocumentImportError('COPY_FAILED', e);
    }
    const original = normalizeDocumentName(originalName) ?? `document.${DOCUMENT_EXTENSION[mime]}`;
    const name = (displayName !== undefined ? normalizeDocumentName(displayName) : null) ?? displayNameFromFileName(original) ?? original;
    try {
      return this.uow.run(() =>
        this.repo.add({ tripId, fileName, originalName: original, displayName: name, mimeType: mime, sizeBytes: size, createdAt: this.clock.now() }),
      );
    } catch (e) {
      this.store.remove(fileName);
      throw e;
    }
  }

  /** Returns false when the name is empty after normalisation (nothing changes). */
  rename(tripId: number, id: number, displayName: string): boolean {
    const name = normalizeDocumentName(displayName);
    if (!name) return false;
    this.require(tripId, id);
    this.repo.rename(id, name);
    return true;
  }

  delete(tripId: number, id: number): void {
    this.require(tripId, id);
    const file = this.uow.run(() => this.repo.remove(id));
    if (file) this.deleteFiles([file]);
  }

  async share(tripId: number, id: number): Promise<'shared' | 'sharing_unavailable' | 'missing'> {
    const d = this.require(tripId, id);
    if (!this.store.exists(d.fileName)) return 'missing';
    const ext = DOCUMENT_EXTENSION[d.mimeType];
    return this.store.share(d.fileName, `${d.displayName}.${ext}`, d.mimeType);
  }

  /** Deletes files whose rows were already removed in a committed transaction (best effort). */
  deleteFiles(fileNames: readonly string[]): void {
    for (const f of fileNames) {
      try {
        this.store.remove(f);
      } catch {
        // Left for `cleanup` (unreferenced files are removed after the grace period).
      }
    }
  }

  viewerAvailable(): boolean {
    return this.renderer.isAvailable();
  }

  /** What the viewer shows: PDF page sizes (pages render lazily) or the image's display copy. */
  async openForViewing(tripId: number, id: number, imageMaxPx: number): Promise<ViewerContent | 'missing'> {
    const d = this.require(tripId, id);
    if (!this.store.exists(d.fileName)) return 'missing';
    const uri = this.store.uriOf(d.fileName);
    if (isImageDocument(d.mimeType)) return { kind: 'image', page: await this.renderer.renderImage(uri, d.fileName, imageMaxPx) };
    return { kind: 'pdf', pages: await this.renderer.pdfPageSizes(uri) };
  }

  renderPdfPage(tripId: number, id: number, page: number, widthPx: number): Promise<RenderedPage> {
    const d = this.require(tripId, id);
    return this.renderer.renderPdfPage(this.store.uriOf(d.fileName), d.fileName, page, widthPx);
  }

  /**
   * Safe reconciliation (startup): deletes stored files no row references (older than the grace
   * period) and temporary share copies/renders. Rows whose file is missing are kept and shown as
   * missing, so the user decides. Never touches financial data.
   */
  cleanup(): { orphanFilesDeleted: number } {
    this.store.cleanupTemporary();
    const live = new Set(this.repo.allFileNames());
    const now = Date.parse(this.clock.now());
    let orphanFilesDeleted = 0;
    for (const f of this.store.listFiles()) {
      if (live.has(f.name)) continue;
      if (f.modifiedMs !== null && now - f.modifiedMs < DOCUMENT_ORPHAN_GRACE_MS) continue;
      this.store.remove(f.name);
      orphanFilesDeleted++;
    }
    return { orphanFilesDeleted };
  }

  private require(tripId: number, id: number): TripDocument {
    const d = this.repo.get(id);
    // Trip isolation: a document is only reachable through its own trip.
    if (!d || d.tripId !== tripId) throw new Error(`Document ${id} not found in trip ${tripId}`);
    return d;
  }

  private view(d: TripDocument): TripDocumentView {
    return {
      ...d,
      createdLocalDate: localDateOf(d.createdAt, this.clock.offsetMinutes()),
      isImage: isImageDocument(d.mimeType),
      available: this.store.exists(d.fileName),
    };
  }
}
