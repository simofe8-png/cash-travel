import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';

import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));

function seed() {
  const s = mockServices;
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'THB' }, []);
  const cat = (k: string) => s.categories.getBuiltin(k).id;
  const food = s.expenseService.addExpense({ tripId, amount: money(10000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, description: 'Noodles', occurrence: occurrenceAtLocal('2026-11-02', '12:00', 420) });
  const taxi = s.expenseService.addExpense({ tripId, amount: money(20000, 'THB'), categoryId: cat('TRANSPORT'), payment: { method: 'CARD', cardId: null }, description: 'Taxi', occurrence: occurrenceAtLocal('2026-11-03', '09:00', 420) });
  const fx = s.fxService.exchange({ tripId, given: money(10000, 'USD'), received: money(320000, 'THB'), occurrence: occurrenceAtLocal('2026-11-03', '10:00', 420) });
  return { food, taxi, fx, cat };
}

describe('Journal screen', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('renders days newest first with expense-only totals', async () => {
    const { food, taxi, fx } = seed();
    await openApp('/journal');
    await waitFor(() => expect(screen.getByTestId('day-2026-11-03')).toBeTruthy());
    expect(screen.getByTestId('day-total-2026-11-03')).toHaveTextContent(/฿200\.00/); // taxi only, FX excluded
    expect(screen.getByTestId('day-total-2026-11-02')).toHaveTextContent(/฿100\.00/);
    for (const id of [food, taxi, fx]) expect(screen.getByTestId(`action-${id}`)).toBeTruthy();
  });

  it('search and filters narrow the list; tapping a row opens Action Details', async () => {
    const { food, taxi, fx } = seed();
    const r = await openApp('/journal');
    await act(async () => fireEvent.changeText(screen.getByTestId('journal-search'), 'noodle'));
    expect(screen.queryByTestId(`action-${taxi}`)).toBeNull();
    expect(screen.getByTestId(`action-${food}`)).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByTestId('journal-search'), ''));
    await press('journal-filter');
    await press('filter-type-FX_EXCHANGE');
    expect(screen.queryByTestId(`action-${food}`)).toBeNull();
    expect(screen.getByTestId(`action-${fx}`)).toBeTruthy();
    await press('active-type');
    await press(`action-${taxi}`);
    await waitFor(() => expect(r.getPathname()).toBe(`/action/${taxi}`));
  });

  it('opens pre-filtered by category (Summary category tile)', async () => {
    const { food, taxi, cat } = seed();
    await openApp(`/journal?category=${cat('FOOD')}`);
    await waitFor(() => expect(screen.getByTestId(`action-${food}`)).toBeTruthy());
    expect(screen.queryByTestId(`action-${taxi}`)).toBeNull();
    expect(screen.getByTestId('active-cat')).toBeTruthy();
  });
});
