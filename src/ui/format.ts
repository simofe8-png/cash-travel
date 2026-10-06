import { currencyInfo, formatAmount, toDecimalString, type Decimal, type Money } from '../domain/money';

/** Unicode isolates keep numbers/currency LTR inside Hebrew (RTL) text. */
const LRI = '⁦';
const PDI = '⁩';

export function ltr(s: string): string {
  return `${LRI}${s}${PDI}`;
}

const PREFIX_SYMBOLS = new Set(['ILS', 'USD', 'EUR', 'GBP', 'JPY', 'THB', 'INR', 'KRW', 'TRY', 'VND', 'PHP', 'GEL']);

/** Drops an all-zero fraction ("850.00" → "850"); never rounds a non-zero fraction. */
function trimZeroFraction(s: string): string {
  return s.replace(/\.0+$/, '');
}

/**
 * "₪1,234.50", "-฿850", "1,234.50 CHF" — always LTR-isolated, exact (string-based). Whole amounts
 * are shown without ".00" (approved UI); any non-zero fraction is shown in full.
 */
export function formatMoney(m: Money, opts: { signed?: boolean; outflow?: boolean } = {}): string {
  const info = currencyInfo(m.currency);
  const abs = trimZeroFraction(formatAmount({ ...m, minor: Math.abs(m.minor) }));
  // `outflow`: display a spent amount with a leading minus (presentation only).
  const sign = m.minor < 0 || (opts.outflow && m.minor > 0) ? '-' : opts.signed && m.minor > 0 ? '+' : '';
  const body = PREFIX_SYMBOLS.has(m.currency) ? `${sign}${info.symbol}${abs}` : `${sign}${abs} ${m.currency}`;
  return ltr(body);
}

/** Amount without symbol (for inputs/edit prefill), e.g. "1234.50". */
export function plainAmount(m: Money): string {
  return trimZeroFraction(formatAmount({ ...m, minor: Math.abs(m.minor) }).replace(/,/g, ''));
}

export function formatRate(from: string, to: string, rate: Decimal, digits = 4): string {
  const s = toDecimalString(rate);
  const [i, f = ''] = s.split('.');
  const frac = f.slice(0, digits);
  return ltr(`1 ${from} = ${i}${frac ? `.${frac}` : ''} ${to}`);
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function parts(date: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "3 בנובמבר 2026" */
export function formatDate(date: string, withYear = true): string {
  const p = parts(date);
  return `${p.d} ב${MONTHS[p.m - 1]}${withYear ? ` ${p.y}` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "31.10.2026" — the approved numeric date style (fields, headers, lists). */
export function formatDateNumeric(date: string): string {
  const p = parts(date);
  return ltr(`${pad(p.d)}.${pad(p.m)}.${p.y}`);
}

/** "יום ראשון, 18.10.2026" */
export function formatDayHeader(date: string): string {
  const p = parts(date);
  return `יום ${DAYS[p.dow]}, ${formatDateNumeric(date)}`;
}

/** "10.10.2026 - 31.10.2026" */
export function formatRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  return ltr(`${pad(a.d)}.${pad(a.m)}.${a.y} - ${pad(b.d)}.${pad(b.m)}.${b.y}`);
}
