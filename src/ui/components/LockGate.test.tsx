import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';

import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';

let mockServices: ReturnType<typeof testServices>;
jest.mock('../../composition/appContainer', () => ({ getAppServices: () => mockServices }));
jest.setTimeout(30000);

describe('Lock screen', () => {
  beforeEach(() => {
    mockServices = testServices();
    mockServices.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(1, 'ILS')]);
  });
  afterEach(() => cleanup());

  it('no lock screen when the lock is off', async () => {
    await openApp('/');
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('when on: covers the app at start; failed auth keeps it; success opens it', async () => {
    await mockServices.appLockService.enable();
    mockServices.deviceAuth.results = ['failed', 'success'];
    await openApp('/');
    await act(async () => jest.runOnlyPendingTimers());
    await waitFor(() => expect(screen.getByText('האימות נכשל. נסו שוב.')).toBeTruthy());
    expect(screen.getByTestId('lock-screen')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('unlock')));
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
  });

  it('enables from Settings only after confirming with device auth', async () => {
    await openApp('/settings');
    await act(async () => fireEvent(screen.getByTestId('settings-lock-switch'), 'valueChange', true));
    expect(mockServices.appLockService.isEnabled()).toBe(true);
    expect(mockServices.deviceAuth.prompts).toEqual(['אימות להפעלת נעילת האפליקציה']);
  });
});
