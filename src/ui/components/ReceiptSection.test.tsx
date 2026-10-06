import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));
let tripId: number;
let tx: number;

describe('Receipt UI', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420);
    tripId = mockServices.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(100000, 'THB')]);
    tx = mockServices.expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: mockServices.categories.getBuiltin('FOOD').id, payment: { method: 'CASH' } });
  });
  afterEach(() => cleanup());

  it('Action Details: capture, preview, replace and delete', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    await openApp(`/action/${tx}`);
    await press('receipt-capture');
    await waitFor(() => expect(screen.getByTestId('receipt-thumb')).toBeTruthy());
    expect(mockServices.receiptStore.files.size).toBe(1);
    await press('receipt-thumb');
    expect(screen.getByTestId('receipt-preview')).toBeTruthy();
    await press('receipt-preview-close');
    await press('receipt-replace');
    await waitFor(() => expect([...mockServices.receiptStore.files.keys()]).toEqual(['r-test-2.jpg']));
    await press('receipt-delete');
    await waitFor(() => expect(screen.getByTestId('receipt-capture')).toBeTruthy());
    expect(mockServices.receiptStore.files.size).toBe(0);
    alert.mockRestore();
  });

  it('camera permission denied: explains and stores nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockServices.receiptCamera.next = { status: 'denied' };
    await openApp(`/action/${tx}`);
    await press('receipt-capture');
    expect(alert).toHaveBeenCalledWith('אין גישה למצלמה', expect.any(String));
    expect(mockServices.receiptStore.files.size).toBe(0);
    alert.mockRestore();
  });

  it('Add Action: a receipt captured before saving is attached to the new action', async () => {
    await openApp('/add');
    await act(async () => fireEvent.changeText(screen.getByTestId('expense-amount'), '50'));
    await press('category-FOOD');
    await press('add-advanced');
    await press('add-receipt');
    expect(screen.getByTestId('add-receipt-thumb')).toBeTruthy();
    await press('add-save');
    const newId = mockServices.journalService.recent(tripId, 1)[0]!.id;
    await waitFor(() => expect(mockServices.receiptService.uriFor(newId)).not.toBeNull());
    expect(mockServices.journalService.recent(tripId, 1)[0]!.hasReceipt).toBe(true);
  });
});
