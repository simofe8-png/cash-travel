// Real SQLite repositories + use-cases for application-level tests (same wiring as the app).
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import { createServices } from '../composition/createServices';
import { FakeCamera, FakeReceiptStore } from './FakeReceipts';
import { FakeClock, migratedDb } from './fixtures';

export function testServices(providers: FxRateProvider[] = []) {
  const db = migratedDb();
  const clock = new FakeClock();
  const receiptStore = new FakeReceiptStore(() => Date.parse(clock.now()));
  const receiptCamera = new FakeCamera();
  return { db, clock, receiptStore, receiptCamera, ...createServices(db, clock, { fxProviders: providers, receiptStore, receiptCamera }) };
}
