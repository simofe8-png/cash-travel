import { screen } from '@testing-library/react-native';
import { act, cleanup, fireEvent, waitFor } from 'expo-router/testing-library';

import { money } from '../../domain/money';
import { occurrenceAtLocal } from '../../domain/time';
import { testServices } from '../../testing/services';
import { openApp } from '../../testing/ui';
import { formatMoney } from '../format';
import { esc, renderTripReportHtml } from './reportHtml';

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
  tripId = s.tripService.createTrip({ name: 'Thailand <script>alert(1)</script>', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(1000000, 'THB')]);
  const cat = (k: string) => s.categories.getBuiltin(k).id;
  s.expenseService.addExpense({ tripId, amount: money(200000, 'ILS'), categoryId: cat('ACCOMMODATION'), payment: { method: 'CARD', cardId: null }, occurrence: at('2026-10-20') });
  const food = s.expenseService.addExpense({ tripId, amount: money(85000, 'THB'), categoryId: cat('FOOD'), payment: { method: 'CASH' }, description: '<img src=x onerror=alert(1)> & "dinner"', occurrence: at('2026-11-01') });
  s.atmService.withdraw({ tripId, received: money(1000000, 'THB'), fee: money(22000, 'THB'), cardId: null, occurrence: at('2026-11-02') });
  s.fxService.exchange({ tripId, given: money(10000, 'THB'), received: money(1000, 'USD'), occurrence: at('2026-11-03') });
  return { food };
}

describe('PDF trip report', () => {
  beforeEach(() => {
    mockServices = testServices();
  });
  afterEach(() => cleanup());

  it('report figures match the Reporting Engine', () => {
    seed();
    const data = mockServices.tripReportService.data(tripId);
    const html = renderTripReportHtml(data);
    const r = mockServices.reportingService.spending(tripId);
    expect(data.spending).toEqual(r);
    for (const v of [r.totalTripCost.amount, r.duringTrip.amount, r.preTrip.amount, r.cash.amount, r.card.amount, r.atmFees.amount, r.averagePerDay!.amount]) {
      expect(html).toContain(esc(formatMoney(v)));
    }
    expect(r.totalTripCost.amount).toEqual(money(210700, 'ILS')); // 2000 + 85 + 22 ATM fee
  });

  it('escapes user text and contains no images, scripts or receipts', async () => {
    const { food } = seed();
    await mockServices.receiptService.attach(food, 'file:///cache/receipt.jpg');
    const html = renderTripReportHtml(mockServices.tripReportService.data(tripId));
    // No raw tags or file URIs; escaped text such as "&lt;img … onerror=" is inert.
    expect(html).not.toMatch(/<script|<img|file:\/\//i);
    expect(html).toContain('Thailand &lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;dinner&quot;');
  });

  it('states clearly that it is a report and not a backup', () => {
    seed();
    const html = renderTripReportHtml(mockServices.tripReportService.data(tripId));
    expect(html).toContain('דוח לסיכום בלבד — אינו גיבוי');
    expect(html).toContain('dir="rtl"');
    expect(html).not.toMatch(/תקציב|budget/i);
  });

  it('Settings export renders the report and hands it to the share sheet with a safe file name', async () => {
    seed();
    await openApp('/settings');
    await act(async () => fireEvent.press(screen.getByTestId('settings-export')));
    await waitFor(() => expect(mockServices.pdfExporter.exports).toHaveLength(1));
    const e = mockServices.pdfExporter.exports[0]!;
    expect(e.fileName).toBe('CashTravel-Thailand-scriptalert1script.pdf');
    expect(e.html).toContain(esc(formatMoney(mockServices.reportingService.spending(tripId).totalTripCost.amount)));
  });
});
