// Real SQLite repositories + use-cases for application-level tests (same wiring as the app).
import type { FxRateProvider } from '../application/ports/FxRateProvider';
import { createServices } from '../composition/createServices';
import { FakeClock, migratedDb } from './fixtures';

export function testServices(providers: FxRateProvider[] = []) {
  const db = migratedDb();
  const clock = new FakeClock();
  return { db, clock, ...createServices(db, clock, providers) };
}
