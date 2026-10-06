import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';

import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));
const type = (id: string, text: string) => act(async () => fireEvent.changeText(screen.getByTestId(id), text));

describe('Trip Setup screen', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420); // Nov 3 local
    mockServices.fxRates.save(
      [
        { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-02' },
        { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-02' },
      ],
      'seed',
    );
  });
  afterEach(() => cleanup());

  it('creates a trip with opening balances recorded through the ledger', async () => {
    const r = await openApp('/');
    await waitFor(() => expect(screen.getByTestId('screen-tripsetup')).toBeTruthy());
    await type('trip-name', 'תאילנד');
    await press('opening-add');
    await press('currency-THB');
    await type('opening-amount-0', '7,000');
    expect(screen.getByTestId('trip-equivalent')).toHaveTextContent(/₪700(?![.\d])/); // ≈ ₪700 at 0.10
    await press('trip-save');

    await waitFor(() => expect(r.getPathname()).toBe('/'));
    const trip = mockServices.tripService.currentTrip()!;
    expect(trip).toMatchObject({ name: 'תאילנד', startDate: '2026-11-03', endDate: '2026-11-10', reportingCurrency: 'ILS' });
    expect(mockServices.ledger.balances(trip.id)).toEqual([expect.objectContaining({ currency: 'THB', openingMinor: 700000, balanceMinor: 700000 })]);
    expect(mockServices.db.get("SELECT COUNT(*) AS n FROM transactions WHERE type = 'OPENING_BALANCE'")).toEqual({ n: 1 });
  });

  it('shows validation errors and saves nothing', async () => {
    await openApp('/trip-setup');
    await press('opening-add');
    await press('currency-USD');
    await type('opening-amount-0', '1.005');
    await press('trip-save');
    expect(screen.getByTestId('trip-errors')).toHaveTextContent(/יותר מדי ספרות/);
    await type('opening-amount-0', '10');
    await press('trip-save');
    expect(screen.getByTestId('trip-errors')).toHaveTextContent(/צריך לתת לטיול שם/);
    expect(mockServices.tripService.listTrips()).toEqual([]);
  });

  it('shows "rate unavailable" honestly for a currency without cached rates', async () => {
    await openApp('/trip-setup');
    await press('opening-add');
    await press('currency-VND');
    await type('opening-amount-0', '500000');
    expect(screen.getByTestId('trip-equivalent')).toHaveTextContent(/אין עדיין שער/);
  });

  it('edit mode prefills, and changing an opening amount is an audited ledger revision', async () => {
    const id = mockServices.tripService.createTrip({ name: 'Old', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB')]);
    await openApp(`/trip-setup?tripId=${id}`);
    expect(screen.getByTestId('trip-name').props.value).toBe('Old');
    expect(screen.getByTestId('opening-amount-0').props.value).toBe('7000');
    await type('trip-name', 'New');
    await type('opening-amount-0', '8000');
    await press('trip-save');
    await waitFor(() => expect(mockServices.tripService.getTrip(id)?.name).toBe('New'));
    expect(mockServices.tripService.openingBalances(id)).toEqual([money(800000, 'THB')]);
    expect(mockServices.db.all('SELECT action FROM transaction_history ORDER BY id').map((h: any) => h.action)).toEqual(['CREATE', 'EDIT']);
  });
});
