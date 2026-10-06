import path from 'node:path';

import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';

import { money } from '../domain/money';
import { testServices } from '../testing/services';

let mockServices: ReturnType<typeof testServices>;

jest.mock('../composition/appContainer', () => ({
  getAppServices: () => mockServices,
}));

// The first router render transforms all route modules (cold: several seconds under parallel load).
jest.setTimeout(30000);

const APP_DIR = path.resolve(__dirname, '../app');
/**
 * RNTL 14 renders asynchronously: renderRouter returns the render promise with router helpers
 * attached. Await the render but keep the helpers (returning the promise itself would unwrap it).
 */
async function open(url: string) {
  const r = renderRouter(APP_DIR, { initialUrl: url });
  await r;
  return { getPathname: () => r.getPathname() };
}

const trip = { name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' };

describe('navigation shell', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('without a trip, the shell redirects to Trip Setup', async () => {
    const r = await open('/');
    await waitFor(() => expect(screen.getByTestId('screen-tripsetup')).toBeTruthy());
    expect(r.getPathname()).toBe('/trip-setup');
  });

  it('with a trip, tabs render Home and the + button opens Add Action', async () => {
    mockServices.tripService.createTrip(trip, [money(100, 'THB')]);
    const r = await open('/');
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
    for (const label of ['בית', 'יומן', 'סיכום', 'הגדרות']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    await act(async () => fireEvent.press(screen.getByTestId('tab-add')));
    await waitFor(() => expect(r.getPathname()).toBe('/add'));
    expect(screen.getByTestId('screen-addaction')).toBeTruthy();
  });

  it.each([
    ['/journal', 'screen-journal'],
    ['/summary', 'screen-summary'],
    ['/settings', 'screen-settings'],
    ['/trip-setup', 'screen-tripsetup'],
    ['/action/1', 'screen-actiondetails'],
    ['/add', 'screen-addaction'],
  ])('route %s renders its screen', async (url, id) => {
    mockServices.tripService.createTrip(trip, []);
    await open(url);
    await waitFor(() => expect(screen.getByTestId(id)).toBeTruthy());
  });
});
