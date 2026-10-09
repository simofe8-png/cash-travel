// Real SQLite repositories + use-cases for application-level tests (same wiring as the app).
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import { createServices } from '../composition/createServices';
import { FakeDocumentRenderer, FakeDocumentSource, FakeDocumentStore } from './FakeDocuments';
import { FakeCamera, FakeDeviceAuth, FakePdfExporter, FakeReceiptStore } from './FakeReceipts';
import { FakeClock, migratedDb } from './fixtures';

export function testServices(providers: FxRateProvider[] = []) {
  const db = migratedDb();
  const clock = new FakeClock();
  const receiptStore = new FakeReceiptStore(() => Date.parse(clock.now()));
  const receiptCamera = new FakeCamera();
  const deviceAuth = new FakeDeviceAuth();
  const pdfExporter = new FakePdfExporter();
  const documentStore = new FakeDocumentStore(() => Date.parse(clock.now()));
  const documentSource = new FakeDocumentSource(documentStore);
  const documentRenderer = new FakeDocumentRenderer();
  const platform = { fxProviders: providers, receiptStore, receiptCamera, deviceAuth, pdfExporter, documentStore, documentSource, documentRenderer };
  return { db, clock, receiptStore, receiptCamera, deviceAuth, pdfExporter, documentStore, documentSource, documentRenderer, ...createServices(db, clock, platform) };
}
