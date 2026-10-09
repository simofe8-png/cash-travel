import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { APP_DIR, openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

const press = (id: string) => act(async () => fireEvent.press(screen.getByTestId(id)));
const type = (id: string, text: string) => act(async () => fireEvent.changeText(screen.getByTestId(id), text));
let tripId: number;

describe('Settings screen', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.clock.set('2026-11-03T05:00:00.000Z', 420);
    tripId = mockServices.tripService.createTrip({ name: 'Thailand', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(700000, 'THB')]);
  });
  afterEach(() => cleanup());

  it('adds a card with issuer + fee classification only (no credentials)', async () => {
    await openApp('/settings');
    await press('settings-add-card');
    await press('issuer-MAX');
    await type('card-nickname', 'Travel');
    await press('fee-FEE_PERCENT');
    await type('card-fee-percent', '2.5');
    await press('card-save');
    await waitFor(() => expect(mockServices.cardService.list()).toHaveLength(1));
    const row = mockServices.db.get('SELECT * FROM cards');
    expect(row).toEqual({ id: 1, issuer: 'MAX', classification: 'FEE_PERCENT:2.5', nickname: 'Travel', billing_currency: 'ILS', archived_at: null, created_at: expect.any(String) });
    expect(Object.keys(row as object).some((k) => /number|cvv|expir|last4|pan/i.test(k))).toBe(false);
  });

  it('rejects an invalid fee percent', async () => {
    await openApp('/settings');
    await press('settings-add-card');
    await press('fee-FEE_PERCENT');
    await type('card-fee-percent', '45');
    await press('card-save');
    expect(screen.getByText(/אחוז עמלה לא תקין/)).toBeTruthy();
    expect(mockServices.cardService.list()).toHaveLength(0);
  });

  it('changing the reporting currency re-presents figures but never mutates records', async () => {
    const before = mockServices.db.all('SELECT * FROM transactions ORDER BY id');
    await openApp('/settings');
    await press('settings-reporting');
    await press('currency-USD');
    await waitFor(() => expect(mockServices.tripService.getTrip(tripId)?.reportingCurrency).toBe('USD'));
    expect(mockServices.db.all('SELECT * FROM transactions ORDER BY id')).toEqual(before);
  });

  it('creates a custom category and deletes it with reassignment to Other', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    await openApp('/settings');
    await press('settings-categories');
    await press('cat-new');
    await type('cat-name', 'מתנות');
    await press('cat-icon-gift');
    await press('cat-save');
    const gifts = mockServices.categoryService.list().find((c) => c.name === 'מתנות')!;
    const exp = mockServices.expenseService.addExpense({ tripId, amount: money(100, 'THB'), categoryId: gifts.id, payment: { method: 'CASH' } });
    await press(`cat-delete-${gifts.id}`);
    const d = mockServices.ledger.get(exp)!.draft;
    expect(d.type === 'EXPENSE' && d.categoryId).toBe(mockServices.categories.getBuiltin('OTHER').id);
    expect(mockServices.categoryService.list().some((c) => c.id === gifts.id)).toBe(false);
    alert.mockRestore();
  });

  it('edit-trip entry opens Trip Setup in edit mode', async () => {
    const r = await openApp('/settings');
    await press('settings-edit-trip');
    await waitFor(() => expect(r.getPathname()).toBe('/trip-setup'));
    expect(screen.getByTestId('trip-name').props.value).toBe('Thailand');
  });

  it('deletes the trip after a destructive confirmation, then switches trip or returns to New Trip', async () => {
    const rome = mockServices.tripService.createTrip({ name: 'Rome', startDate: '2027-01-01', endDate: '2027-01-05', reportingCurrency: 'EUR' }, []);
    mockServices.tripService.selectTrip(tripId);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, message, buttons) => {
      expect(message).toBe('מחיקת הטיול תמחק את כל הפעולות, היתרות והתמונות השייכות אליו. לא ניתן לבטל פעולה זו.');
      expect(buttons?.map((b) => b.text)).toEqual(['ביטול', 'מחק את הטיול']);
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const r = await openApp('/settings');
    await press('settings-delete-trip');
    await waitFor(() => expect(r.getPathname()).toBe('/'));
    expect(mockServices.tripService.getTrip(tripId)).toBeUndefined();
    expect(mockServices.tripService.currentTrip()?.id).toBe(rome);

    await act(async () => router.push('/settings'));
    await press('settings-delete-trip');
    await waitFor(() => expect(r.getPathname()).toBe('/trip-setup'));
    expect(mockServices.tripService.listTrips()).toEqual([]);
    expect(alert).toHaveBeenCalledTimes(2);
    alert.mockRestore();
  });

  it('cancel keeps the trip', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'cancel')?.onPress?.());
    await openApp('/settings');
    await press('settings-delete-trip');
    expect(mockServices.tripService.getTrip(tripId)).toBeDefined();
    alert.mockRestore();
  });

  it('the app has exactly the approved screens (seven V1 screens + Documents, ADR-0013)', () => {
    const routes = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routes(join(dir, e.name)).map((r) => `${e.name}/${r}`) : [e.name]));
    const screens = routes(APP_DIR).filter((f) => !f.endsWith('_layout.tsx') && !f.endsWith('plus.tsx'));
    expect(screens.sort()).toEqual(['(tabs)/documents.tsx', '(tabs)/index.tsx', '(tabs)/journal.tsx', '(tabs)/settings.tsx', '(tabs)/summary.tsx', 'action/[id].tsx', 'add.tsx', 'trip-setup.tsx']);
  });
});
