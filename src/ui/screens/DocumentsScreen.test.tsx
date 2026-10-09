import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { money } from '../../domain/money';
import { SAMPLE } from '../../testing/FakeDocuments';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));
const layoutViewer = () =>
  act(async () => fireEvent(screen.getByTestId('document-viewer'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } }));
let tripId: number;

describe('Documents screen', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420);
    tripId = mockServices.tripService.createTrip({ name: 'Rome', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(10000, 'EUR')]);
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('is a bottom-navigation destination: בית | יומן | ＋ | מסמכים | סיכום | הגדרות', async () => {
    await openApp('/');
    const labels = ['בית', 'יומן', 'מסמכים', 'סיכום', 'הגדרות'].map((t) => screen.getAllByText(t).length > 0);
    expect(labels).toEqual([true, true, true, true, true]);
    expect(screen.getByTestId('tab-add')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getAllByText('מסמכים')[0]!));
    expect(screen.getByTestId('screen-documents')).toBeTruthy();
  });

  it('empty state → import a PDF → listed with type, size and date', async () => {
    await openApp('/documents');
    expect(screen.getByText('אין עדיין מסמכים לטיול')).toBeTruthy();
    await press('documents-import');
    await waitFor(() => expect(screen.getByText('Boarding pass')).toBeTruthy());
    const id = mockServices.documentService.list(tripId)[0]!.id;
    expect(screen.getByTestId(`document-${id}`)).toBeTruthy();
    expect(screen.getByText(/PDF.*KB.*03\.11\.2026/)).toBeTruthy();
  });

  it('camera capture is stored as an image named with the capture time', async () => {
    await openApp('/documents');
    await press('documents-capture');
    await waitFor(() => expect(mockServices.documentService.list(tripId)).toHaveLength(1));
    expect(mockServices.documentService.list(tripId)[0]).toMatchObject({ mimeType: 'image/jpeg', displayName: 'מסמך מצולם 03.11.2026 12:00' });
    expect(screen.getByText('מסמך מצולם 03.11.2026 12:00')).toBeTruthy();
  });

  it('unsupported file and denied camera are explained; nothing is stored', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockServices.documentSource.nextPick = { data: SAMPLE.text, name: 'notes.pdf' };
    mockServices.documentSource.nextCapture = { status: 'denied' };
    await openApp('/documents');
    await press('documents-import');
    expect(alert).toHaveBeenCalledWith('סוג הקובץ אינו נתמך', expect.any(String));
    await press('documents-capture');
    expect(alert).toHaveBeenCalledWith('אין גישה למצלמה', expect.any(String));
    expect(mockServices.documentService.list(tripId)).toEqual([]);
    expect(mockServices.documentStore.files.size).toBe(0);
  });

  it('rename, share and delete (with confirmation) through the actions sheet', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    const id = await mockServices.documentService.importFile(tripId, mockServices.documentStore.addSource('file:///cache/x', SAMPLE.pdf), 'Hotel.pdf');
    await openApp('/documents');

    await press(`document-more-${id}`);
    await press('document-action-rename');
    await act(async () => fireEvent.changeText(screen.getByTestId('document-rename-input'), 'הזמנת מלון'));
    await press('document-rename-save');
    expect(screen.getByText('הזמנת מלון')).toBeTruthy();

    await press(`document-more-${id}`);
    await press('document-action-share');
    await waitFor(() => expect(mockServices.documentStore.shared).toEqual([expect.objectContaining({ shareName: 'הזמנת מלון.pdf', mimeType: 'application/pdf' })]));

    await press(`document-more-${id}`);
    await press('document-action-delete');
    expect(alert).toHaveBeenCalledWith('מחיקת מסמך', expect.stringContaining('הזמנת מלון'), expect.any(Array));
    await waitFor(() => expect(screen.getByText('אין עדיין מסמכים לטיול')).toBeTruthy());
    expect(mockServices.documentStore.files.size).toBe(0);
  });

  it('cancelling the delete confirmation keeps the document', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'cancel')?.onPress?.());
    const id = await mockServices.documentService.importFile(tripId, mockServices.documentStore.addSource('file:///cache/x', SAMPLE.pdf), 'Hotel.pdf');
    await openApp('/documents');
    await press(`document-more-${id}`);
    await press('document-action-delete');
    expect(mockServices.documentService.list(tripId)).toHaveLength(1);
  });

  it('shows only the current trip’s documents', async () => {
    await mockServices.documentService.importFile(tripId, mockServices.documentStore.addSource('file:///cache/a', SAMPLE.pdf), 'Rome tickets.pdf');
    const other = mockServices.tripService.createTrip({ name: 'Paris', startDate: '2027-01-01', endDate: '2027-01-05', reportingCurrency: 'ILS' }, []);
    await mockServices.documentService.importFile(other, mockServices.documentStore.addSource('file:///cache/b', SAMPLE.pdf), 'Paris tickets.pdf');
    await openApp('/documents');
    expect(screen.getByText('Paris tickets')).toBeTruthy();
    expect(screen.queryByText('Rome tickets')).toBeNull();
  });
});

describe('Document viewer', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420);
    tripId = mockServices.tripService.createTrip({ name: 'Rome', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, []);
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });
  const add = (data: Uint8Array, name: string) => mockServices.documentService.importFile(tripId, mockServices.documentStore.addSource(`file:///cache/${name}`, data), name);

  it('PDF: full-screen viewer lays out every page and renders the visible ones lazily', async () => {
    const id = await add(SAMPLE.pdf, 'Tickets.pdf');
    await openApp('/documents');
    await press(`document-${id}`);
    await layoutViewer();
    await waitFor(() => expect(screen.getByTestId('document-viewer-pages')).toBeTruthy());
    expect(screen.getByTestId('document-page-0')).toBeTruthy();
    expect(screen.getByTestId('document-page-2')).toBeTruthy();
    // Visible page (0) and its neighbour are rendered at 2× the viewport's pixel width; page 2 is not.
    await waitFor(() => expect(mockServices.documentRenderer.rendered.map((r) => r.page).sort()).toEqual([0, 1]));
    expect(screen.getByTestId('document-viewer-page')).toBeTruthy();
    await press('document-viewer-close');
    expect(screen.queryByTestId('document-viewer')).toBeNull();
  });

  it('image: one zoomable page from the display copy', async () => {
    const id = await add(SAMPLE.heic, 'passport.heic');
    await openApp('/documents');
    await press(`document-${id}`);
    await layoutViewer();
    await waitFor(() => expect(screen.getByTestId('document-page-0')).toBeTruthy());
    expect(screen.queryByTestId('document-page-1')).toBeNull();
    expect(screen.queryByTestId('document-viewer-page')).toBeNull();
  });

  it('a file the renderer cannot open is explained, with sharing as the way out', async () => {
    const id = await add(SAMPLE.pdf, 'locked.pdf');
    mockServices.documentRenderer.failWith = new Error('password');
    await openApp('/documents');
    await press(`document-${id}`);
    await layoutViewer();
    await waitFor(() => expect(screen.getByTestId('document-viewer-message')).toBeTruthy());
    await press('document-viewer-share-fallback');
    await waitFor(() => expect(mockServices.documentStore.shared).toHaveLength(1));
  });

  it('a missing private file is flagged in the list and not opened', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const id = await add(SAMPLE.pdf, 'gone.pdf');
    mockServices.documentStore.files.clear();
    await openApp('/documents');
    expect(screen.getByTestId(`document-missing-${id}`)).toBeTruthy();
    await press(`document-${id}`);
    expect(alert).toHaveBeenCalledWith('הקובץ לא נמצא', expect.any(String));
    expect(screen.queryByTestId('document-viewer')).toBeNull();
  });
});
