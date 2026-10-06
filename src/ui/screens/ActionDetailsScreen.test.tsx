import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));
const type = (id: string, text: string) => act(async () => fireEvent.changeText(screen.getByTestId(id), text));

let tripId: number;
const thb = () => mockServices.ledger.balances(tripId).find((b) => b.currency === 'THB')!.balanceMinor;

function seed() {
  const s = mockServices;
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  s.fxRates.save(
    [
      { source: 'ECB', quote: 'ILS', rate: '4', rateDate: '2026-11-01' },
      { source: 'ECB', quote: 'THB', rate: '40', rateDate: '2026-11-01' },
    ],
    'seed',
  );
  tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB')]);
  const food = s.categories.getBuiltin('FOOD').id;
  const cash = s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: food, payment: { method: 'CASH' }, description: 'Pad Thai', occurrence: occurrenceAtLocal('2026-11-02', '13:30', 420) });
  const card = s.expenseService.addExpense({ tripId, amount: money(500000, 'THB'), categoryId: food, payment: { method: 'CARD', cardId: null }, occurrence: occurrenceAtLocal('2026-11-02', '20:00', 420) });
  return { cash, card };
}

describe('Action Details screen', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('shows the adaptive details and change history', async () => {
    const { cash } = seed();
    await openApp(`/action/${cash}`);
    expect(screen.getByTestId('details-amount')).toHaveTextContent(/-฿850(?![.\d])/);
    expect(screen.getByText('Pad Thai')).toBeTruthy();
    expect(screen.getByText('13:30')).toBeTruthy();
    expect(screen.getByTestId('details-history')).toHaveTextContent(/נוצר/);
  });

  it('editing an expense leaves no stale ledger effects and keeps the original time', async () => {
    const { cash } = seed();
    const r = await openApp(`/action/${cash}`);
    await press('details-edit');
    await waitFor(() => expect(r.getPathname()).toBe('/add'));
    expect(screen.getByTestId('expense-amount').props.value).toBe('850');
    await type('expense-amount', '900');
    await press('add-save');
    await waitFor(() => expect(mockServices.ledger.get(cash)!.revision).toBe(2));
    expect(thb()).toBe(700000 - 90000);
    expect(mockServices.ledger.findInconsistencies(tripId)).toEqual([]);
    const active = mockServices.db.all('SELECT e.amount_minor FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id AND t.revision = e.revision WHERE t.id = ?', [cash]);
    expect(active).toEqual([{ amount_minor: -90000 }]);
    expect(mockServices.ledger.get(cash)!.draft.occurredAt).toBe(occurrenceAtLocal('2026-11-02', '13:30', 420).occurredAt);
  });

  it('records the actual card charge; reporting then prefers it', async () => {
    const { card } = seed();
    await openApp(`/action/${card}`);
    expect(screen.getByTestId('charge-estimate')).toHaveTextContent(/₪500(?![.\d])/);
    expect(screen.getByTestId('charge-estimate')).toHaveTextContent(/לא כולל עמלות/);
    await type('actual-amount', '512.40');
    await press('actual-save');
    expect(mockServices.ledger.get(card)!.cardCharge).toMatchObject({ estimateMinor: 50000, actualMinor: 51240 });
    expect(mockServices.reportingService.spending(tripId).card.amount).toEqual(money(51240, 'ILS'));
    expect(thb()).toBe(700000 - 85000); // card charge never touches cash
  });

  it('soft delete removes the action from balances, journal and reports immediately', async () => {
    const { cash } = seed();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const r = await openApp(`/action/${cash}`);
    await press('details-delete');
    await waitFor(() => expect(r.getPathname()).not.toBe(`/action/${cash}`));
    expect(thb()).toBe(700000);
    expect(mockServices.journalService.list(tripId).map((x) => x.id)).not.toContain(cash);
    expect(mockServices.reportingService.spending(tripId).cash.count).toBe(0);
    expect(mockServices.ledger.history(cash).map((h) => h.action)).toEqual(['CREATE', 'DELETE']);
    alert.mockRestore();
  });

  it('a deleted action shows its state and cannot be edited', async () => {
    const { cash } = seed();
    mockServices.transactionService.delete(cash);
    await openApp(`/action/${cash}`);
    expect(screen.getByTestId('details-deleted')).toBeTruthy();
    expect(screen.queryByTestId('details-edit')).toBeNull();
  });
});
