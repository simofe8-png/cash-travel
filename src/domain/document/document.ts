/**
 * Trip documents (ADR-0013): tickets, bookings, passports' copies — kept as files next to the trip.
 * Not financial records: no ledger effect, no amounts. Types are decided by the file's content
 * (magic bytes), never by the name or by the MIME type a picker reports.
 */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

export const DOCUMENT_EXTENSION: Record<DocumentMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};

/** Largest file accepted (protects app-private storage; travel PDFs/photos are far smaller). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
/** Bytes read from a file to recognise its type. */
export const DOCUMENT_SNIFF_BYTES = 1024;
export const MAX_DOCUMENT_NAME_LENGTH = 120;

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif']);

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Detects a supported document type from the first bytes of a file; null when unsupported. */
export function sniffDocumentType(head: Uint8Array): DocumentMimeType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((v, i) => head[i] === v)) return 'image/png';
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(head, 8, 12))) return 'image/heic';
  // The PDF header may follow a few junk bytes (allowed by the spec within the first 1024 bytes).
  if (ascii(head, 0, Math.min(head.length, DOCUMENT_SNIFF_BYTES)).includes('%PDF-')) return 'application/pdf';
  return null;
}

export function isImageDocument(mime: DocumentMimeType): boolean {
  return mime !== 'application/pdf';
}

/** Trimmed single-line name without control characters; null when nothing is left. */
export function normalizeDocumentName(input: string): string | null {
  const s = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return [...s].slice(0, MAX_DOCUMENT_NAME_LENGTH).join('').trim();
}

/** "Boarding pass.pdf" → "Boarding pass" (the default display name of an imported file). */
export function displayNameFromFileName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  return normalizeDocumentName(base.replace(/\.[A-Za-z0-9]{1,5}$/, ''));
}
