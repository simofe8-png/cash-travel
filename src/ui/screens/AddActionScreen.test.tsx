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

let tripId: number;
const bal = (c: string) => mockServices.ledger.balances(tripId).find((b) => b.currency === c)?.balanceMinor ?? 0;
const txCount = () => mockServices.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE type <> 'OPENING_BALANCE'")!.n;

describe('Add Action screen', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420);
    tripId = mockServices.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB'), money(30000, 'USD')]);
  });
  afterEach(() => cleanup());

  it('normal expense is minimal: amount → category → save (cash, now, default currency)', async () => {
    const r = await openApp('/add');
    await type('expense-amount', '850');
    await press('category-FOOD');
    await press('add-save');
    await waitFor(() => expect(r.getPathname()).not.toBe('/add'));
    expect(bal('THB')).toBe(615000);
    const row = mockServices.journalService.recent(tripId, 1)[0]!;
    expect(row).toMatchObject({ type: 'EXPENSE', amountMinor: 85000, currency: 'THB', paymentMethod: 'CASH', localDate: '2026-11-03' });
  });

  it('card expense with DCC keeps cash untouched and remembers card as the next default', async () => {
    await openApp('/add');
    await type('expense-amount', '5000');
    await press('category-SHOPPING');
    await press('pay-card-any');
    await press('add-advanced');
    await press('add-dcc');
    await type('charged-amount', '479');
    await press('add-save');
    await waitFor(() => expect(txCount()).toBe(1));
    expect(bal('THB')).toBe(700000);
    const id = mockServices.journalService.recent(tripId, 1)[0]!.id;
    expect(mockServices.ledger.get(id)!.cardCharge).toMatchObject({ chargedCurrency: 'ILS', chargedAmountMinor: 47900 });
    expect(mockServices.expenseService.defaults(tripId).payment).toEqual({ method: 'CARD', cardId: null });
  });

  it('FX exchange: two legs, live effective rate, not an expense', async () => {
    await openApp('/add?mode=FX_EXCHANGE');
    await type('fx-given-amount', '100');
    await press('fx-given-currency');
    await press('currency-USD');
    await press('fx-received-currency');
    await press('currency-THB');
    await type('fx-received-amount', '3,200');
    expect(screen.getByTestId('fx-rate')).toHaveTextContent(/1 USD = 32 THB/);
    await press('add-save');
    await waitFor(() => expect(bal('USD')).toBe(20000));
    expect(bal('THB')).toBe(1020000);
    expect(mockServices.reportingService.spending(tripId).totalTripCost.count).toBe(0);
  });

  it('ATM withdrawal with local fee: cash + principal, fee not cash', async () => {
    await openApp('/add?mode=ATM_WITHDRAWAL&currency=THB');
    await type('atm-amount', '10000');
    await type('atm-fee', '220');
    await press('add-save');
    await waitFor(() => expect(bal('THB')).toBe(1700000));
    expect(mockServices.reportingService.spending(tripId).atmFees.amount.currency).toBe('ILS');
  });

  it('cash adjustment from a counted amount records only the difference', async () => {
    await openApp('/add?mode=CASH_ADJUSTMENT&currency=THB');
    await type('adjust-amount', '6,500');
    expect(screen.getByTestId('adjust-diff')).toHaveTextContent(/-฿500\.00/);
    await press('add-save');
    await waitFor(() => expect(bal('THB')).toBe(650000));
    expect(mockServices.journalService.recent(tripId, 1)[0]).toMatchObject({ type: 'CASH_ADJUSTMENT', amountMinor: -50000 });
  });

  it('validation errors save nothing', async () => {
    await openApp('/add');
    await press('add-save');
    expect(screen.getByTestId('add-errors')).toHaveTextContent(/נא לבחור קטגוריה/);
    await type('expense-amount', '1.005');
    await press('category-FOOD');
    await press('add-save');
    expect(screen.getByTestId('add-errors')).toHaveTextContent(/יותר מדי ספרות/);
    expect(txCount()).toBe(0);
  });

  it('a chosen past date/time is stored as that local date', async () => {
    await openApp('/add');
    await type('expense-amount', '100');
    await press('category-TRANSPORT');
    await press('add-advanced');
    await type('add-time', '23:45');
    await press('add-save');
    await waitFor(() => expect(txCount()).toBe(1));
    expect(mockServices.journalService.recent(tripId, 1)[0]).toMatchObject({ localDate: '2026-11-03', occurredAt: '2026-11-03T16:45:00.000Z' });
  });
});
