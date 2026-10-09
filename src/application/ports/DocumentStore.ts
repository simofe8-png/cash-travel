/** App-private storage of trip document files. File names are bare (no paths). */
export interface DocumentStore {
  /** First `n` bytes of a (temporary) source file. */
  readHead(sourceUri: string, n: number): Promise<Uint8Array>;
  /** Size of a (temporary) source file in bytes. */
  sizeOf(sourceUri: string): number;
  /** Free bytes on the app's storage volume, when known. */
  availableBytes(): number | null;
  /** Copies a temporary source file into private storage (removing the temporary copy); returns the new file name. */
  importFrom(sourceUri: string, extension: string): Promise<string>;
  /** Deletes a temporary source file the app received (picker/camera cache copy); never throws. */
  discardSource(sourceUri: string): void;
  /** Deletes a stored file and anything derived from it (viewer renders); missing files are ignored. */
  remove(fileName: string): void;
  uriOf(fileName: string): string;
  exists(fileName: string): boolean;
  /** Stored files with modification time (ms since epoch) when known. */
  listFiles(): { name: string; modifiedMs: number | null }[];
  /** Shares a stored file through the system share sheet under a readable name. */
  share(fileName: string, shareName: string, mimeType: string): Promise<'shared' | 'sharing_unavailable'>;
  /** Removes temporary share copies and viewer renders (bounded, startup). */
  cleanupTemporary(): void;
}

export type DocumentSourceResult =
  | { status: 'picked'; uri: string; name: string }
  | { status: 'cancelled' }
  | { status: 'denied' };

/** Where new documents come from: the system file picker or the system camera. */
export interface DocumentSource {
  pickFile(): Promise<DocumentSourceResult>;
  /** Camera permission is requested only when invoked. */
  capturePhoto(): Promise<DocumentSourceResult>;
}

export interface RenderedPage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

/** Turns stored documents into displayable images for the in-app viewer (cached, regenerable). */
export interface DocumentRenderer {
  /** False where no native renderer exists (e.g. Expo Go); the viewer then offers sharing instead. */
  isAvailable(): boolean;
  /** Page sizes of a PDF in points. Throws for damaged or password-protected files. */
  pdfPageSizes(fileUri: string): Promise<{ width: number; height: number }[]>;
  renderPdfPage(fileUri: string, cacheKey: string, page: number, widthPx: number): Promise<RenderedPage>;
  /** A display copy of an image (HEIC decoded, orientation applied, longest side ≤ maxPx). */
  renderImage(fileUri: string, cacheKey: string, maxPx: number): Promise<RenderedPage>;
}
