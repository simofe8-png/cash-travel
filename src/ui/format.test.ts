import { money } from '../domain/money';
import { flagEmoji } from './components/Flag';
import { formatDateNumeric, formatDayHeader, formatMoney, formatRange, plainAmount } from './format';

const strip = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('display formatting (approved UI)', () => {
  it('drops only an all-zero fraction; never rounds', () => {
    expect(strip(formatMoney(money(85000, 'THB')))).toBe('฿850');
    expect(strip(formatMoney(money(85050, 'THB')))).toBe('฿850.50');
    expect(strip(formatMoney(money(1, 'USD')))).toBe('$0.01');
    expect(strip(formatMoney(money(1234500, 'ILS')))).toBe('₪12,345');
    expect(strip(formatMoney(money(1500, 'JPY')))).toBe('¥1,500');
    expect(strip(formatMoney(money(1000, 'JOD')))).toBe('1 JOD');
    expect(strip(formatMoney(money(1001, 'JOD')))).toBe('1.001 JOD');
  });

  it('signs: negative, signed positive, and outflow display', () => {
    expect(strip(formatMoney(money(-7000, 'USD')))).toBe('-$70');
    expect(strip(formatMoney(money(4000000, 'THB'), { signed: true }))).toBe('+฿40,000');
    expect(strip(formatMoney(money(85000, 'THB'), { outflow: true }))).toBe('-฿850');
    expect(strip(formatMoney(money(0, 'THB'), { outflow: true }))).toBe('฿0');
  });

  it('edit prefill keeps exact digits', () => {
    expect(plainAmount(money(700000, 'THB'))).toBe('7000');
    expect(plainAmount(money(700050, 'THB'))).toBe('7000.50');
  });

  it('numeric dates and day headers', () => {
    expect(strip(formatDateNumeric('2026-10-06'))).toBe('06.10.2026');
    expect(strip(formatDayHeader('2026-10-18'))).toBe('יום ראשון, 18.10.2026');
    expect(strip(formatRange('2026-10-10', '2026-10-31'))).toBe('10.10.2026 - 31.10.2026');
  });

  it('currency flags from ISO codes', () => {
    expect(flagEmoji('THB')).toBe('🇹🇭');
    expect(flagEmoji('EUR')).toBe('🇪🇺');
    expect(flagEmoji('ILS')).toBe('🇮🇱');
  });
});
