// In-memory document store/source/renderer for tests.
import type { DocumentRenderer, DocumentSource, DocumentSourceResult, DocumentStore } from '../application/ports/DocumentStore';

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
/** Minimal file contents by type (only the header matters to type detection). */
export const SAMPLE = {
  pdf: bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj'),
  jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  heic: Uint8Array.from([0, 0, 0, 0x18, ...bytes('ftypheic'), 0, 0, 0, 0]),
  text: bytes('hello, not a document'),
};

export class FakeDocumentStore implements DocumentStore {
  /** Temporary source files (picker/camera cache copies). */
  sources = new Map<string, Uint8Array>();
  files = new Map<string, { data: Uint8Array; modifiedMs: number }>();
  shared: { fileName: string; shareName: string; mimeType: string }[] = [];
  free: number | null = 10 * 1024 * 1024 * 1024;
  sizeOverride: number | null = null;
  failNextImport = false;
  sharingAvailable = true;
  temporaryCleanups = 0;
  private n = 0;
  constructor(public nowMs = () => Date.parse('2026-11-03T05:00:00.000Z')) {}

  addSource(uri: string, data: Uint8Array): string {
    this.sources.set(uri, data);
    return uri;
  }
  private source(uri: string): Uint8Array {
    const d = this.sources.get(uri);
    if (!d) throw new Error(`no such file ${uri}`);
    return d;
  }
  async readHead(uri: string, n: number) {
    return this.source(uri).slice(0, n);
  }
  sizeOf(uri: string) {
    return this.sizeOverride ?? this.source(uri).length;
  }
  availableBytes() {
    return this.free;
  }
  async importFrom(uri: string, extension: string) {
    const data = this.source(uri);
    if (this.failNextImport) {
      this.failNextImport = false;
      throw new Error('disk full');
    }
    const name = `d-test-${++this.n}.${extension}`;
    this.files.set(name, { data, modifiedMs: this.nowMs() });
    this.sources.delete(uri);
    return name;
  }
  discardSource(uri: string) {
    this.sources.delete(uri);
  }
  remove(fileName: string) {
    this.files.delete(fileName);
  }
  uriOf(fileName: string) {
    return `file:///private/documents/${fileName}`;
  }
  exists(fileName: string) {
    return this.files.has(fileName);
  }
  listFiles() {
    return [...this.files.entries()].map(([name, f]) => ({ name, modifiedMs: f.modifiedMs }));
  }
  async share(fileName: string, shareName: string, mimeType: string) {
    if (!this.sharingAvailable) return 'sharing_unavailable' as const;
    this.shared.push({ fileName, shareName, mimeType });
    return 'shared' as const;
  }
  cleanupTemporary() {
    this.temporaryCleanups++;
  }
}

export class FakeDocumentSource implements DocumentSource {
  constructor(private readonly store: FakeDocumentStore) {}
  nextPick: DocumentSourceResult | { data: Uint8Array; name: string } = { data: SAMPLE.pdf, name: 'Boarding pass.pdf' };
  nextCapture: DocumentSourceResult | { data: Uint8Array; name: string } = { data: SAMPLE.jpeg, name: 'camera.jpg' };
  private n = 0;
  private resolve(r: DocumentSourceResult | { data: Uint8Array; name: string }): DocumentSourceResult {
    if ('status' in r) return r;
    return { status: 'picked', uri: this.store.addSource(`file:///cache/pick-${++this.n}`, r.data), name: r.name };
  }
  async pickFile() {
    return this.resolve(this.nextPick);
  }
  async capturePhoto() {
    return this.resolve(this.nextCapture);
  }
}

export class FakeDocumentRenderer implements DocumentRenderer {
  available = true;
  pageSizes = [
    { width: 595, height: 842 },
    { width: 595, height: 842 },
    { width: 842, height: 595 },
  ];
  failWith: Error | null = null;
  rendered: { fileUri: string; page: number; widthPx: number }[] = [];
  isAvailable() {
    return this.available;
  }
  async pdfPageSizes() {
    if (this.failWith) throw this.failWith;
    return this.pageSizes;
  }
  async renderPdfPage(fileUri: string, cacheKey: string, page: number, widthPx: number) {
    this.rendered.push({ fileUri, page, widthPx });
    const s = this.pageSizes[page]!;
    return { uri: `file:///cache/doc-view/${cacheKey}/p${page}.jpg`, width: widthPx, height: Math.round((widthPx * s.height) / s.width) };
  }
  async renderImage(_fileUri: string, cacheKey: string, maxPx: number) {
    if (this.failWith) throw this.failWith;
    return { uri: `file:///cache/doc-view/${cacheKey}/image.jpg`, width: Math.round(maxPx * 0.75), height: maxPx };
  }
}

/** The three document adapters, wired together (for tests that build their own platform). */
export function fakeDocumentAdapters(nowMs?: () => number) {
  const documentStore = new FakeDocumentStore(nowMs);
  return { documentStore, documentSource: new FakeDocumentSource(documentStore), documentRenderer: new FakeDocumentRenderer() };
}
