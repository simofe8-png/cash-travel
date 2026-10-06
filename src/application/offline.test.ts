// Offline & lifecycle hardening (Step 26): the whole financial workflow without network, process
// restarts on a file database, later rate refresh without mutating originals, timezone changes.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createServices } from '../composition/createServices';
import { migrate } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import type { ReferenceRate } from '../domain/fx';
import { money } from '../domain/money';
import { occurrenceAtLocal } from '../domain/time';
import { FakeCamera, FakeDeviceAuth, FakePdfExporter, FakeReceiptStore } from '../testing/FakeReceipts';
import { FakeClock } from '../testing/fixtures';
import { NodeSqliteDatabase } from '../testing/NodeSqliteDatabase';
import type { FxRateProvider } from './ports/FxRateProvider';

class SwitchableProvider implements FxRateProvider {
  readonly source = 'ECB';
  online = false;
  calls = 0;
  constructor(private readonly rates: ReferenceRate[]) {}
  async fetchRates(from: string, to: string, currencies: readonly string[]) {
    this.calls++;
    if (!this.online) throw new Error('Network request failed');
    return this.rates.filter((r) => r.rateDate >= from && r.rateDate <= to && currencies.includes(r.quote));
  }
}

const RATES: ReferenceRate[] = [
  { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-02' },
  { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-02' },
  { source: 'ECB', quote: 'USD', rate: '1', rateDate: '2026-11-02' },
];

describe('offline-first and lifecycle', () => {
  let dir: string;
  let path: string;
  const provider = new SwitchableProvider(RATES);
  const clock = new FakeClock('2026-11-03T05:00:00.000Z', 420);

  /** Simulates one app process: open the file DB, migrate, wire services. */
  function boot() {
    const db = new NodeSqliteDatabase(path);
    migrate(db, MIGRATIONS, clock.now);
    const services = createServices(db, clock, {
      fxProviders: [provider],
      receiptStore: new FakeReceiptStore(),
      receiptCamera: new FakeCamera(),
      deviceAuth: new FakeDeviceAuth(),
      pdfExporter: new FakePdfExporter(),
    });
    return { db, s: services };
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ct-offline-'));
    path = join(dir, 'cashtravel.db');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('the complete financial workflow works with no network at all', async () => {
    const { db, s } = boot();
    const tripId = s.tripService.createTrip({ name: 'Offline', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB'), money(30000, 'USD')]);
    const food = s.categories.getBuiltin('FOOD').id;
    const at = (t: string) => occurrenceAtLocal('2026-11-02', t, 420);
    s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, occurrence: at('12:00') });
    const card = s.expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: null }, occurrence: at('13:00') });
    s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: at('14:00') });
    s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: null, occurrence: at('15:00') });
    s.reconciliationService.reconcile({ tripId, counted: money(1900000, 'THB') });

    // A refresh attempt fails quietly and changes nothing.
    const r = await s.fxRateService.refresh(s.reportingService.rateNeeds(tripId), 'ILS');
    expect(r.errors).toEqual(['ECB: Network request failed']);
    expect(s.ledger.get(card)!.cardCharge!.status).toBe('UNAVAILABLE');

    // Balances are exact from the ledger; reporting is honest about missing rates.
    const bal = Object.fromEntries(s.ledger.balances(tripId).map((b) => [b.currency, b.balanceMinor]));
    expect(bal).toEqual({ THB: 1900000, USD: 20000 });
    const spend = s.reportingService.spending(tripId);
    expect(spend.totalTripCost.count).toBe(0);
    expect(spend.totalTripCost.unavailable).toEqual([money(607000, 'THB')]); // 850 + 5,000 + 220 fee
    expect(s.ledger.findInconsistencies(tripId)).toEqual([]);
    db.close();
  });

  it('process death and restart: everything persists on the reopened database', () => {
    const { db, s } = boot();
    const trip = s.tripService.currentTrip()!;
    expect(trip.name).toBe('Offline');
    expect(Object.fromEntries(s.ledger.balances(trip.id).map((b) => [b.currency, b.balanceMinor]))).toEqual({ THB: 1900000, USD: 20000 });
    expect(s.journalService.list(trip.id)).toHaveLength(7);
    db.close();
  });

  it('back online: refresh fills rates and estimates without mutating any original record', async () => {
    const { db, s } = boot();
    const trip = s.tripService.currentTrip()!;
    const before = { tx: db.all('SELECT * FROM transactions ORDER BY id'), le: db.all('SELECT * FROM ledger_entries ORDER BY id'), cc: db.all('SELECT * FROM card_charges ORDER BY transaction_id') };
    provider.online = true;
    const r = await s.fxRateService.refresh(s.reportingService.rateNeeds(trip.id), 'ILS');
    expect(r.errors).toEqual([]);
    expect({ tx: db.all('SELECT * FROM transactions ORDER BY id'), le: db.all('SELECT * FROM ledger_entries ORDER BY id'), cc: db.all('SELECT * FROM card_charges ORDER BY transaction_id') }).toEqual(before);
    const spend = s.reportingService.spending(trip.id);
    expect(spend.totalTripCost.unavailableCount).toBe(0);
    expect(spend.totalTripCost.amount).toEqual(money(60700, 'ILS')); // 85 + 500 (derived card estimate) + 22
    db.close();
  });

  it('cached rates keep working after going offline again', () => {
    provider.online = false;
    const { db, s } = boot();
    expect(s.fxRateService.quote('THB', 'ILS', '2026-11-03')).toMatchObject({ rateDate: '2026-11-02', source: 'ECB' });
    db.close();
  });

  it('timezone change mid-trip never regroups history; "today" follows the device', () => {
    const { db, s } = boot();
    const trip = s.tripService.currentTrip()!;
    // Late-night entry in Bangkok (+7): Nov 4, 23:30 local.
    clock.set('2026-11-04T16:30:00.000Z', 420);
    const id = s.expenseService.addExpense({ tripId: trip.id, amount: money(100, 'THB'), categoryId: s.categories.getBuiltin('FOOD').id, payment: { method: 'CASH' } });
    // Flying to Israel (+2): the same instant is Nov 4, 18:30 there; a later moment crosses midnight differently.
    clock.set('2026-11-04T22:30:00.000Z', 120);
    expect(s.tripService.today()).toBe('2026-11-05'); // 00:30 in Israel
    const day = s.journalService.days(trip.id).find((d) => d.rows.some((r) => r.id === id))!;
    expect(day.date).toBe('2026-11-04');
    db.close();
  });
});
