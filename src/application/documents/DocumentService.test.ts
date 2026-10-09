// Trip documents (ADR-0013): import, persistence, trip isolation, deletion, viewer content.
import { createServices } from '../../composition/createServices';
import { money } from '../../domain/money';
import { SAMPLE } from '../../testing/FakeDocuments';
import { testServices } from '../../testing/services';
import { DOCUMENT_ORPHAN_GRACE_MS, DocumentImportError } from './DocumentService';

function setup() {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  const trip = (name: string) => s.tripService.createTrip({ name, startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(100000, 'THB')]);
  const a = trip('A');
  const b = trip('B');
  let n = 0;
  const source = (data: Uint8Array) => s.documentStore.addSource(`file:///cache/src-${++n}`, data);
  return { s, a, b, source };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof DocumentImportError ? e.code : `other: ${(e as Error).message}`;
  }
  return 'no error';
};

describe('DocumentService — import', () => {
  it('imports PDF, JPEG, PNG and HEIC with metadata detected from the content', async () => {
    const { s, a, source } = setup();
    const pdf = await s.documentService.importFile(a, source(SAMPLE.pdf), 'Boarding pass.pdf');
    await s.documentService.importFile(a, source(SAMPLE.jpeg), 'scan.jpeg');
    await s.documentService.importFile(a, source(SAMPLE.png), 'map.png');
    // The name says .jpg; the content (and therefore the stored type) is HEIC.
    await s.documentService.importFile(a, source(SAMPLE.heic), 'IMG_1.jpg');

    const docs = s.documentService.list(a);
    expect(docs.map((d) => d.mimeType)).toEqual(['image/heic', 'image/png', 'image/jpeg', 'application/pdf']);
    const d = s.documentService.get(a, pdf)!;
    expect(d).toMatchObject({
      tripId: a,
      originalName: 'Boarding pass.pdf',
      displayName: 'Boarding pass',
      mimeType: 'application/pdf',
      sizeBytes: SAMPLE.pdf.length,
      createdLocalDate: '2026-11-03',
      isImage: false,
      available: true,
    });
    expect(d.fileName).toMatch(/\.pdf$/);
    expect(s.documentStore.files.has(d.fileName)).toBe(true);
    expect(docs.find((x) => x.mimeType === 'image/heic')!.fileName).toMatch(/\.heic$/);
    // Temporary picker copies are consumed.
    expect(s.documentStore.sources.size).toBe(0);
  });

  it('camera capture: stored as JPEG under the given display name', async () => {
    const { s, a } = setup();
    const r = await s.documentService.capturePhoto();
    if (r.status !== 'picked') throw new Error('expected a capture');
    const id = await s.documentService.importFile(a, r.uri, r.name, 'מסמך מצולם 03.11.2026');
    expect(s.documentService.get(a, id)).toMatchObject({ displayName: 'מסמך מצולם 03.11.2026', mimeType: 'image/jpeg', originalName: 'camera.jpg' });
  });

  it('a file whose name the picker cannot tell is called "מסמך"', async () => {
    const { s, a, source } = setup();
    const id = await s.documentService.importFile(a, source(SAMPLE.pdf), '');
    expect(s.documentService.get(a, id)).toMatchObject({ displayName: 'מסמך', originalName: 'מסמך.pdf' });
  });

  it('rejects unsupported, empty, oversized files and a full disk — nothing is stored, temp copy removed', async () => {
    const { s, a, source } = setup();
    expect(await codeOf(s.documentService.importFile(a, source(SAMPLE.text), 'notes.pdf'))).toBe('UNSUPPORTED');
    expect(await codeOf(s.documentService.importFile(a, source(new Uint8Array()), 'empty.pdf'))).toBe('EMPTY');
    s.documentStore.sizeOverride = 51 * 1024 * 1024;
    expect(await codeOf(s.documentService.importFile(a, source(SAMPLE.pdf), 'huge.pdf'))).toBe('TOO_LARGE');
    s.documentStore.sizeOverride = null;
    s.documentStore.free = 1024 * 1024;
    expect(await codeOf(s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf'))).toBe('NO_SPACE');
    expect(s.documentService.list(a)).toEqual([]);
    expect(s.documentStore.files.size).toBe(0);
    expect(s.documentStore.sources.size).toBe(0);
  });

  it('a failed copy stores no row; an unreadable source is reported as a failed import', async () => {
    const { s, a, source } = setup();
    s.documentStore.failNextImport = true;
    expect(await codeOf(s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf'))).toBe('COPY_FAILED');
    expect(await codeOf(s.documentService.importFile(a, 'file:///cache/gone', 'x.pdf'))).toBe('COPY_FAILED');
    expect(s.documentService.list(a)).toEqual([]);
    expect(s.documentStore.files.size).toBe(0);
  });

  it('a failed row write deletes the copied file (no orphan)', async () => {
    const { s, a, source } = setup();
    const original = s.db.run.bind(s.db);
    s.db.run = (sql, params) => {
      if (/INSERT INTO trip_documents/.test(sql)) throw new Error('disk I/O error');
      return original(sql, params);
    };
    await expect(s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf')).rejects.toThrow('disk I/O error');
    expect(s.documentStore.files.size).toBe(0);
  });
});

describe('DocumentService — persistence, rename, share, delete', () => {
  it('documents persist across a restart (new service wiring over the same database)', async () => {
    const { s, a, source } = setup();
    const id = await s.documentService.importFile(a, source(SAMPLE.pdf), 'Hotel.pdf');
    const restarted = createServices(s.db, s.clock, {
      fxProviders: [],
      receiptStore: s.receiptStore,
      receiptCamera: s.receiptCamera,
      deviceAuth: s.deviceAuth,
      pdfExporter: s.pdfExporter,
      documentStore: s.documentStore,
      documentSource: s.documentSource,
      documentRenderer: s.documentRenderer,
    });
    expect(restarted.documentService.list(a).map((d) => [d.id, d.displayName, d.available])).toEqual([[id, 'Hotel', true]]);
  });

  it('rename normalises the name and refuses an empty one', async () => {
    const { s, a, source } = setup();
    const id = await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    expect(s.documentService.rename(a, id, '  ביטוח   נסיעות ')).toBe(true);
    expect(s.documentService.get(a, id)!.displayName).toBe('ביטוח נסיעות');
    expect(s.documentService.rename(a, id, '   ')).toBe(false);
    expect(s.documentService.get(a, id)!.displayName).toBe('ביטוח נסיעות');
  });

  it('share uses the display name with the right extension and MIME type', async () => {
    const { s, a, source } = setup();
    const id = await s.documentService.importFile(a, source(SAMPLE.heic), 'IMG_7.HEIC');
    s.documentService.rename(a, id, 'Passport');
    expect(await s.documentService.share(a, id)).toBe('shared');
    expect(s.documentStore.shared).toEqual([{ fileName: s.documentService.get(a, id)!.fileName, shareName: 'Passport.heic', mimeType: 'image/heic' }]);
    s.documentStore.sharingAvailable = false;
    expect(await s.documentService.share(a, id)).toBe('sharing_unavailable');
  });

  it('delete removes the row and the private file', async () => {
    const { s, a, source } = setup();
    const keep = await s.documentService.importFile(a, source(SAMPLE.pdf), 'keep.pdf');
    const gone = await s.documentService.importFile(a, source(SAMPLE.png), 'gone.png');
    const goneFile = s.documentService.get(a, gone)!.fileName;
    s.documentService.delete(a, gone);
    expect(s.documentService.list(a).map((d) => d.id)).toEqual([keep]);
    expect(s.documentStore.files.has(goneFile)).toBe(false);
    expect(s.documentStore.files.size).toBe(1);
  });

  it('a missing private file is shown as unavailable (not silently dropped); share/view report it', async () => {
    const { s, a, source } = setup();
    const id = await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    s.documentStore.files.clear();
    expect(s.documentService.get(a, id)!.available).toBe(false);
    expect(await s.documentService.share(a, id)).toBe('missing');
    expect(await s.documentService.openForViewing(a, id, 2000)).toBe('missing');
    s.documentService.cleanup();
    expect(s.documentService.list(a)).toHaveLength(1);
    s.documentService.delete(a, id);
    expect(s.documentService.list(a)).toEqual([]);
  });
});

describe('DocumentService — trip isolation and trip deletion', () => {
  it('each trip sees only its own documents; cross-trip access is refused', async () => {
    const { s, a, b, source } = setup();
    const inA = await s.documentService.importFile(a, source(SAMPLE.pdf), 'a.pdf');
    const inB = await s.documentService.importFile(b, source(SAMPLE.pdf), 'b.pdf');
    expect(s.documentService.list(a).map((d) => d.id)).toEqual([inA]);
    expect(s.documentService.list(b).map((d) => d.id)).toEqual([inB]);
    expect(s.documentService.get(a, inB)).toBeUndefined();
    expect(() => s.documentService.rename(a, inB, 'x')).toThrow(/not found/);
    expect(() => s.documentService.delete(a, inB)).toThrow(/not found/);
    await expect(s.documentService.share(a, inB)).rejects.toThrow(/not found/);
    expect(s.documentService.get(b, inB)!.displayName).toBe('b');
  });

  it('deleting a trip removes its documents and files; the other trip and all money are untouched', async () => {
    const { s, a, b, source } = setup();
    const food = s.categories.getBuiltin('FOOD').id;
    s.expenseService.addExpense({ tripId: a, amount: money(5000, 'THB'), categoryId: food, payment: { method: 'CASH' } });
    await s.documentService.importFile(a, source(SAMPLE.pdf), 'a1.pdf');
    await s.documentService.importFile(a, source(SAMPLE.jpeg), 'a2.jpg');
    const inB = await s.documentService.importFile(b, source(SAMPLE.pdf), 'b.pdf');
    const bFile = s.documentService.get(b, inB)!.fileName;
    const balancesA = s.ledger.balances(a);

    s.tripService.deleteTrip(b);

    expect(s.db.all('SELECT id FROM trip_documents WHERE trip_id = ?', [b])).toEqual([]);
    expect(s.documentStore.files.has(bFile)).toBe(false);
    expect(s.documentService.list(a)).toHaveLength(2);
    expect(s.documentStore.files.size).toBe(2);
    expect(s.ledger.balances(a)).toEqual(balancesA);
    expect(s.integrityService.check().ok).toBe(true);
  });

  it('a failing trip purge keeps the documents and their files', async () => {
    const { s, b, source } = setup();
    await s.documentService.importFile(b, source(SAMPLE.pdf), 'b.pdf');
    s.ledger.purgeTrip = () => {
      throw new Error('disk I/O error');
    };
    expect(() => s.tripService.deleteTrip(b)).toThrow('disk I/O error');
    expect(s.documentService.list(b)).toHaveLength(1);
    expect(s.documentStore.files.size).toBe(1);
  });

  it('document operations never change financial data', async () => {
    const { s, a, source } = setup();
    const before = { tx: s.db.all('SELECT * FROM transactions'), le: s.db.all('SELECT * FROM ledger_entries'), bal: s.ledger.balances(a) };
    const id = await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    s.documentService.rename(a, id, 'y');
    await s.documentService.share(a, id);
    s.documentService.delete(a, id);
    expect({ tx: s.db.all('SELECT * FROM transactions'), le: s.db.all('SELECT * FROM ledger_entries'), bal: s.ledger.balances(a) }).toEqual(before);
  });
});

describe('DocumentService — viewer content and cleanup', () => {
  it('PDF → page sizes (rendered lazily); image → one display copy', async () => {
    const { s, a, source } = setup();
    const pdf = await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    const img = await s.documentService.importFile(a, source(SAMPLE.heic), 'y.heic');
    const p = await s.documentService.openForViewing(a, pdf, 2000);
    expect(p).toEqual({ kind: 'pdf', pages: s.documentRenderer.pageSizes });
    const page = await s.documentService.renderPdfPage(a, pdf, 2, 1000);
    expect(page).toMatchObject({ width: 1000, height: Math.round((1000 * 595) / 842) });
    expect(s.documentRenderer.rendered).toEqual([{ fileUri: s.documentStore.uriOf(s.documentService.get(a, pdf)!.fileName), page: 2, widthPx: 1000 }]);
    const i = await s.documentService.openForViewing(a, img, 2000);
    expect(i).toMatchObject({ kind: 'image', page: { width: 1500, height: 2000 } });
  });

  it('a damaged or protected PDF surfaces as an error for the viewer to explain', async () => {
    const { s, a, source } = setup();
    const pdf = await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    s.documentRenderer.failWith = new Error('SecurityException: password required');
    await expect(s.documentService.openForViewing(a, pdf, 2000)).rejects.toThrow(/password/);
  });

  it('cleanup removes unreferenced files after the grace period and temporary copies', async () => {
    const { s, a, source } = setup();
    await s.documentService.importFile(a, source(SAMPLE.pdf), 'x.pdf');
    s.documentStore.files.set('d-orphan-old.pdf', { data: SAMPLE.pdf, modifiedMs: Date.parse('2026-11-03T05:00:00.000Z') - DOCUMENT_ORPHAN_GRACE_MS - 1 });
    s.documentStore.files.set('d-orphan-new.pdf', { data: SAMPLE.pdf, modifiedMs: Date.parse('2026-11-03T05:00:00.000Z') });
    expect(s.documentService.cleanup()).toEqual({ orphanFilesDeleted: 1 });
    expect([...s.documentStore.files.keys()].sort()).toEqual(['d-orphan-new.pdf', s.documentService.list(a)[0]!.fileName].sort());
    expect(s.documentStore.temporaryCleanups).toBe(1);
  });
});
