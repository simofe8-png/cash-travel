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

const at = (d: string) => occurrenceAtLocal(d, '12:00', 420);
let tripId: number;

function seed() {
  const s = mockServices;
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-10-20' },
    ],
    'seed',
  );
  tripId = s.tripService.createTrip({ name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(1000000, 'THB')]);
  const cat = (k: string) => s.categories.getBuiltin(k).id;
  s.expenseService.addExpense({ tripId, amount: money(200000, 'ILS'), categoryId: cat('ACCOMMODATION'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-10-20') });
  s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, occurrence: at('2026-11-01') });
  s.expenseService.addExpense({ tripId, amount: money(30000, 'THB'), categoryId: cat('TRANSPORT'), payment: { method: 'CASH' }, occurrence: at('2026-11-03') });
  s.fxService.exchange({ tripId, given: money(10000, 'THB'), received: money(1000, 'USD'), occurrence: at('2026-11-03') });
  s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: null, occurrence: at('2026-11-02') });
}

describe('Summary screen', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('matches the Reporting Engine exactly', async () => {
    seed();
    await openApp('/summary');
    await waitFor(() => expect(screen.getByTestId('summary-total')).toBeTruthy());
    const r = mockServices.reportingService.spending(tripId);
    const has = (id: string, m: { minor: number; currency: string }) => expect(screen.getByTestId(id)).toHaveTextContent(formatMoney(m), { exact: false });
    has('summary-total-value', r.totalTripCost.amount);
    has('summary-during-value', r.duringTrip.amount);
    has('summary-today-value', r.today.amount);
    has('summary-pre-value', r.preTrip.amount);
    has('summary-cash', r.cash.amount);
    has('summary-card', r.card.amount);
    expect(r.totalTripCost.amount).toEqual(money(213700, 'ILS')); // 2000 + 85 + 30 + 22 fee = 2137.00
    expect(screen.getByTestId('summary-average')).toHaveTextContent(formatMoney(r.averagePerDay!.amount), { exact: false });
    expect(screen.getByTestId('tile-atm-fees')).toHaveTextContent(/₪22(?![.\d])/);
  });

  it('hides zero-spend categories and never shows budget/remaining language', async () => {
    seed();
    await openApp('/summary');
    await waitFor(() => expect(screen.getByTestId('tile-FOOD')).toBeTruthy());
    for (const k of ['ACCOMMODATION', 'FOOD', 'TRANSPORT']) expect(screen.getByTestId(`tile-${k}`)).toBeTruthy();
    for (const k of ['ENTERTAINMENT', 'SHOPPING', 'OTHER']) expect(screen.queryByTestId(`tile-${k}`)).toBeNull();
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/תקציב|נותר|נשאר לך|budget|remaining/i);
  });

  it('category tile opens the Journal filtered to that category', async () => {
    seed();
    const r = await openApp('/summary');
    await act(async () => fireEvent.press(screen.getByTestId('tile-FOOD')));
    await waitFor(() => expect(r.getPathname()).toBe('/journal'));
    expect(screen.getByTestId('active-cat')).toBeTruthy();
  });

  it('empty trip shows an empty state and no average before the trip', async () => {
    mockServices.clock.set('2026-10-01T05:00:00.000Z', 420);
    mockServices.tripService.createTrip({ name: 'Future', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, []);
    await openApp('/summary');
    await waitFor(() => expect(screen.getByText('עוד אין הוצאות לסכם')).toBeTruthy());
    expect(screen.queryByTestId('summary-average')).toBeNull();
  });
});
