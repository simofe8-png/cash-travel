import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';

import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';
import { formatMoney } from '../format';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));

function seed() {
  const s = mockServices;
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'USD', rate: '1', rateDate: '2026-11-01' },
    ],
    'seed',
  );
  const tripId = s.tripService.createTrip({ name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB')]);
  const food = s.categories.getBuiltin('FOOD').id;
  s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, description: 'Pad Thai', occurrence: occurrenceAtLocal('2026-11-03', '11:00', 420) });
  s.expenseService.addExpense({ tripId, amount: money(5000, 'USD'), categoryId: food, payment: { method: 'CASH' }, occurrence: occurrenceAtLocal('2026-11-02', '11:00', 420) }); // USD wallet → −50
  return tripId;
}

describe('Home screen', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('shows wallet, today and trip totals exactly as the engines compute them', async () => {
    const tripId = seed();
    await openApp('/');
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
    const wallets = mockServices.reportingService.wallets(tripId);
    const spending = mockServices.reportingService.spending(tripId);
    const thb = wallets.find((w) => w.currency === 'THB')!;
    expect(screen.getByTestId('wallet-current-THB')).toHaveTextContent(formatMoney(thb.current));
    expect(thb.current).toEqual(money(615000, 'THB'));
    expect(screen.getByTestId('home-today-total')).toHaveTextContent(formatMoney(spending.today.amount), { exact: false });
    expect(spending.today.amount).toEqual(money(8500, 'ILS')); // 850 THB × 0.1
    expect(screen.getByTestId('home-trip-total-value')).toHaveTextContent(formatMoney(spending.totalTripCost.amount), { exact: false });
    expect(screen.getByText('יום 3 מתוך 10', { exact: false })).toBeTruthy();
    expect(screen.getByText('Pad Thai')).toBeTruthy(); // recent actions
  });

  it('flags a negative wallet and offers quick actions that open Add Action in the right mode', async () => {
    seed();
    const r = await openApp('/');
    await waitFor(() => expect(screen.getByTestId('negative-USD')).toBeTruthy());
    expect(screen.getByTestId('wallet-current-USD')).toHaveTextContent(formatMoney(money(-5000, 'USD')));
    await act(async () => fireEvent.press(screen.getByText('המרת מט״ח')));
    await waitFor(() => expect(r.getPathname()).toBe('/add'));
  });

  it('switches the current trip from the trip header', async () => {
    seed();
    const other = mockServices.tripService.createTrip({ name: 'Rome', startDate: '2027-01-01', endDate: '2027-01-05', reportingCurrency: 'EUR' }, []);
    mockServices.tripService.selectTrip(mockServices.tripService.listTrips().find((t) => t.name === 'Thailand')!.id);
    await openApp('/');
    await waitFor(() => expect(screen.getByText('Thailand')).toBeTruthy());
    await press('home-trip');
    await press(`switch-trip-${other}`);
    await waitFor(() => expect(screen.getByText('Rome')).toBeTruthy());
    expect(mockServices.tripService.currentTrip()?.id).toBe(other);
    expect(screen.getByText('הטיול מתחיל בעוד 59 ימים', { exact: false })).toBeTruthy();
  });

  it('empty trip shows friendly empty states', async () => {
    mockServices.tripService.createTrip({ name: 'Empty', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, []);
    await openApp('/');
    await waitFor(() => expect(screen.getByText('עוד לא נרשמו פעולות')).toBeTruthy());
  });
});
