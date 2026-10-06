import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { TripValidationError } from './TripService';

const details = { name: 'תאילנד 2026', startDate: '2026-11-01', endDate: '2026-11-20', reportingCurrency: 'ILS' };
const bal = (ledger: ReturnType<typeof testServices>['ledger'], id: number) =>
  Object.fromEntries(ledger.balances(id).map((b) => [b.currency, [b.openingMinor, b.balanceMinor]]));

describe('TripService — creation and opening balances', () => {
  it('creates a trip with opening balances as ledger events and makes it current', () => {
    const { tripService, ledger, db } = testServices();
    const id = tripService.createTrip(details, [money(700000, 'THB'), money(50000, 'USD')]);
    expect(tripService.currentTrip()?.id).toBe(id);
    expect(bal(ledger, id)).toEqual({ THB: [700000, 700000], USD: [50000, 50000] });
    const rows = db.all<{ type: string }>('SELECT type FROM transactions WHERE trip_id = ?', [id]);
    expect(rows.map((r) => r.type)).toEqual(['OPENING_BALANCE', 'OPENING_BALANCE']);
    expect(ledger.findInconsistencies(id)).toEqual([]);
  });

  it('allows a trip with no opening cash', () => {
    const { tripService, ledger } = testServices();
    const id = tripService.createTrip(details, []);
    expect(ledger.balances(id)).toEqual([]);
  });

  it('is atomic: an invalid opening balance creates neither trip nor entries', () => {
    const { tripService, db } = testServices();
    expect(() => tripService.createTrip(details, [money(1, 'THB'), money(2, 'THB')])).toThrow(TripValidationError);
    expect(() => tripService.createTrip(details, [{ minor: 0, currency: 'THB' }])).toThrow(TripValidationError);
    expect(() => tripService.createTrip({ ...details, endDate: '2026-10-01' }, [])).toThrow(TripValidationError);
    expect(db.get('SELECT COUNT(*) AS n FROM trips')).toEqual({ n: 0 });
    expect(db.get('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 0 });
  });

  it('rolls back the trip if writing an opening balance fails mid-way', () => {
    const { tripService, db } = testServices();
    const realRun = db.run.bind(db);
    let n = 0;
    db.run = (sql, params) => {
      if (sql.startsWith('INSERT INTO ledger_entries') && ++n === 2) throw new Error('io');
      return realRun(sql, params);
    };
    expect(() => tripService.createTrip(details, [money(1, 'THB'), money(2, 'USD')])).toThrow('io');
    db.run = realRun;
    expect(db.get('SELECT COUNT(*) AS n FROM trips')).toEqual({ n: 0 });
    expect(db.get('SELECT COUNT(*) AS n FROM transactions')).toEqual({ n: 0 });
    expect(db.get("SELECT COUNT(*) AS n FROM app_settings WHERE key = 'current_trip_id'")).toEqual({ n: 0 });
  });
});

describe('TripService — edits never silently rewrite financial history', () => {
  it('editing name/dates/reporting currency leaves every transaction untouched', () => {
    const { tripService, db } = testServices();
    const id = tripService.createTrip(details, [money(700000, 'THB')]);
    const before = db.all('SELECT * FROM transactions ORDER BY id');
    const entriesBefore = db.all('SELECT * FROM ledger_entries ORDER BY id');
    tripService.updateTripDetails(id, { name: 'Thailand + Laos', startDate: '2026-10-28', endDate: '2026-11-25', reportingCurrency: 'USD' });
    expect(db.all('SELECT * FROM transactions ORDER BY id')).toEqual(before);
    expect(db.all('SELECT * FROM ledger_entries ORDER BY id')).toEqual(entriesBefore);
    expect(tripService.getTrip(id)).toMatchObject({ name: 'Thailand + Laos', reportingCurrency: 'USD' });
  });

  it('changing opening balances goes through auditable ledger revisions', () => {
    const { tripService, ledger, db } = testServices();
    const id = tripService.createTrip(details, [money(700000, 'THB'), money(50000, 'USD')]);
    tripService.setOpeningBalances(id, [money(800000, 'THB'), money(20000, 'EUR')]);
    expect(bal(ledger, id)).toEqual({ THB: [800000, 800000], USD: [0, 0], EUR: [20000, 20000] });
    const actions = db.all<{ action: string }>('SELECT action FROM transaction_history ORDER BY id').map((h) => h.action);
    expect(actions).toEqual(['CREATE', 'CREATE', 'EDIT', 'DELETE', 'CREATE']);
    expect(tripService.openingBalances(id)).toEqual([money(800000, 'THB'), money(20000, 'EUR')]);
    // Unchanged list → no new history.
    tripService.setOpeningBalances(id, [money(800000, 'THB'), money(20000, 'EUR')]);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transaction_history')!.n).toBe(5);
    expect(ledger.findInconsistencies(id)).toEqual([]);
  });

  it('rejects invalid detail edits without changes', () => {
    const { tripService } = testServices();
    const id = tripService.createTrip(details, []);
    expect(() => tripService.updateTripDetails(id, { ...details, name: '' })).toThrow(TripValidationError);
    expect(tripService.getTrip(id)?.name).toBe(details.name);
  });
});

describe('TripService — multiple trips and current context', () => {
  it('supports current/future/completed trips with explicit selection', () => {
    const { tripService, clock } = testServices();
    clock.set('2026-11-05T10:00:00.000Z', 420);
    const past = tripService.createTrip({ ...details, name: 'Past', startDate: '2026-01-01', endDate: '2026-01-10' }, []);
    const future = tripService.createTrip({ ...details, name: 'Future', startDate: '2027-02-01', endDate: '2027-02-10' }, []);
    const now = tripService.createTrip(details, []);
    const statuses = Object.fromEntries(tripService.listTrips().map((t) => [t.name, t.status]));
    expect(statuses).toEqual({ Past: 'COMPLETED', Future: 'UPCOMING', [details.name]: 'CURRENT' });

    expect(tripService.currentTrip()?.id).toBe(now); // last created
    tripService.selectTrip(past);
    expect(tripService.currentTrip()?.id).toBe(past); // completed trips remain selectable/editable
    tripService.updateTripDetails(past, { ...details, name: 'Past (edited)', startDate: '2026-01-01', endDate: '2026-01-10' });
    expect(tripService.currentTrip()?.name).toBe('Past (edited)');
    expect(() => tripService.selectTrip(999)).toThrow();
    expect(future).toBeGreaterThan(0);
  });

  it('falls back to the most relevant trip when no selection is stored', () => {
    const { tripService, trips, clock } = testServices();
    clock.set('2026-11-05T10:00:00.000Z', 420);
    tripService.createTrip({ ...details, name: 'Past', startDate: '2026-01-01', endDate: '2026-01-10' }, []);
    const cur = tripService.createTrip(details, []);
    tripService.createTrip({ ...details, name: 'Future', startDate: '2027-02-01', endDate: '2027-02-10' }, []);
    trips.setSetting('current_trip_id', null);
    expect(tripService.currentTrip()?.id).toBe(cur);
  });

  it('today follows the device offset (date boundary)', () => {
    const { tripService, clock } = testServices();
    clock.set('2026-10-31T20:00:00.000Z', 420); // Nov 1 03:00 in Bangkok
    const id = tripService.createTrip(details, [money(100, 'THB')]);
    expect(tripService.getTrip(id)?.status).toBe('CURRENT');
    clock.set('2026-10-31T20:00:00.000Z', 180); // Oct 31 23:00 in Israel
    expect(tripService.getTrip(id)?.status).toBe('UPCOMING');
  });
});
