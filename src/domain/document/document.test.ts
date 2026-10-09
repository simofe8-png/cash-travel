import { SAMPLE } from '../../testing/FakeDocuments';
import { displayNameFromFileName, MAX_DOCUMENT_NAME_LENGTH, normalizeDocumentName, sniffDocumentType } from './document';

describe('document type detection (content, not name)', () => {
  it('recognises PDF, JPEG, PNG and HEIC headers', () => {
    expect(sniffDocumentType(SAMPLE.pdf)).toBe('application/pdf');
    expect(sniffDocumentType(SAMPLE.jpeg)).toBe('image/jpeg');
    expect(sniffDocumentType(SAMPLE.png)).toBe('image/png');
    expect(sniffDocumentType(SAMPLE.heic)).toBe('image/heic');
  });

  it('accepts a PDF header after leading junk bytes', () => {
    expect(sniffDocumentType(Uint8Array.from([0x0a, 0x0d, ...SAMPLE.pdf]))).toBe('application/pdf');
  });

  it('rejects text, empty input, other ISO-BMFF brands and truncated headers', () => {
    expect(sniffDocumentType(SAMPLE.text)).toBeNull();
    expect(sniffDocumentType(new Uint8Array())).toBeNull();
    const mp4 = Uint8Array.from([0, 0, 0, 0x18, ...'ftypisom'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect(sniffDocumentType(mp4)).toBeNull();
    expect(sniffDocumentType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('document names', () => {
  it('normalises whitespace and control characters; empty → null', () => {
    expect(normalizeDocumentName('  כרטיס   טיסה\n')).toBe('כרטיס טיסה');
    expect(normalizeDocumentName('a\u0000b')).toBe('a b');
    expect(normalizeDocumentName('   ')).toBeNull();
  });

  it('limits the length', () => {
    expect(normalizeDocumentName('x'.repeat(500))).toHaveLength(MAX_DOCUMENT_NAME_LENGTH);
  });

  it('derives a display name from the file name', () => {
    expect(displayNameFromFileName('Boarding pass.pdf')).toBe('Boarding pass');
    expect(displayNameFromFileName('IMG_2041.HEIC')).toBe('IMG_2041');
    expect(displayNameFromFileName('hotel.booking.v2.pdf')).toBe('hotel.booking.v2');
    expect(displayNameFromFileName('.pdf')).toBeNull();
  });
});
