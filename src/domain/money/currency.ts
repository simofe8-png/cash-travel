/**
 * Supported currencies with ISO 4217 minor-unit exponents. The exponent defines how an amount is
 * stored: integer minor units = major × 10^exponent (ILS 12.34 → 1234; JPY 500 → 500).
 */
export interface CurrencyInfo {
  readonly code: string;
  readonly exponent: number;
  readonly symbol: string;
  readonly nameHe: string;
}

const LIST: readonly CurrencyInfo[] = [
  { code: 'ILS', exponent: 2, symbol: '₪', nameHe: 'שקל חדש' },
  { code: 'USD', exponent: 2, symbol: '$', nameHe: 'דולר אמריקאי' },
  { code: 'EUR', exponent: 2, symbol: '€', nameHe: 'אירו' },
  { code: 'GBP', exponent: 2, symbol: '£', nameHe: 'לירה שטרלינג' },
  { code: 'THB', exponent: 2, symbol: '฿', nameHe: 'באט תאילנדי' },
  { code: 'JPY', exponent: 0, symbol: '¥', nameHe: 'ין יפני' },
  { code: 'CHF', exponent: 2, symbol: 'CHF', nameHe: 'פרנק שווייצרי' },
  { code: 'CAD', exponent: 2, symbol: 'CA$', nameHe: 'דולר קנדי' },
  { code: 'AUD', exponent: 2, symbol: 'A$', nameHe: 'דולר אוסטרלי' },
  { code: 'NZD', exponent: 2, symbol: 'NZ$', nameHe: 'דולר ניו זילנדי' },
  { code: 'CNY', exponent: 2, symbol: 'CN¥', nameHe: 'יואן סיני' },
  { code: 'HKD', exponent: 2, symbol: 'HK$', nameHe: 'דולר הונג קונגי' },
  { code: 'SGD', exponent: 2, symbol: 'S$', nameHe: 'דולר סינגפורי' },
  { code: 'KRW', exponent: 0, symbol: '₩', nameHe: 'וון דרום קוריאני' },
  { code: 'INR', exponent: 2, symbol: '₹', nameHe: 'רופי הודי' },
  { code: 'IDR', exponent: 2, symbol: 'Rp', nameHe: 'רופיה אינדונזית' },
  { code: 'PHP', exponent: 2, symbol: '₱', nameHe: 'פסו פיליפיני' },
  { code: 'MYR', exponent: 2, symbol: 'RM', nameHe: 'רינגיט מלזי' },
  { code: 'VND', exponent: 0, symbol: '₫', nameHe: 'דונג וייטנאמי' },
  { code: 'TRY', exponent: 2, symbol: '₺', nameHe: 'לירה טורקית' },
  { code: 'CZK', exponent: 2, symbol: 'Kč', nameHe: 'קורונה צ׳כית' },
  { code: 'PLN', exponent: 2, symbol: 'zł', nameHe: 'זלוטי פולני' },
  { code: 'HUF', exponent: 2, symbol: 'Ft', nameHe: 'פורינט הונגרי' },
  { code: 'RON', exponent: 2, symbol: 'lei', nameHe: 'לאו רומני' },
  { code: 'SEK', exponent: 2, symbol: 'kr', nameHe: 'כתר שוודי' },
  { code: 'NOK', exponent: 2, symbol: 'kr', nameHe: 'כתר נורווגי' },
  { code: 'DKK', exponent: 2, symbol: 'kr', nameHe: 'כתר דני' },
  { code: 'ISK', exponent: 0, symbol: 'kr', nameHe: 'כתר איסלנדי' },
  { code: 'GEL', exponent: 2, symbol: '₾', nameHe: 'לארי גאורגי' },
  { code: 'AED', exponent: 2, symbol: 'AED', nameHe: 'דירהם אמירותי' },
  { code: 'JOD', exponent: 3, symbol: 'JD', nameHe: 'דינר ירדני' },
  { code: 'EGP', exponent: 2, symbol: 'E£', nameHe: 'לירה מצרית' },
  { code: 'MAD', exponent: 2, symbol: 'MAD', nameHe: 'דירהם מרוקאי' },
  { code: 'ZAR', exponent: 2, symbol: 'R', nameHe: 'ראנד דרום אפריקאי' },
  { code: 'MXN', exponent: 2, symbol: 'MX$', nameHe: 'פסו מקסיקני' },
  { code: 'BRL', exponent: 2, symbol: 'R$', nameHe: 'ריאל ברזילאי' },
];

const BY_CODE: ReadonlyMap<string, CurrencyInfo> = new Map(LIST.map((c) => [c.code, c]));

export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = LIST;

export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(code);
}

export function currencyInfo(code: string): CurrencyInfo {
  const info = BY_CODE.get(code);
  if (!info) throw new Error(`Unsupported currency: ${code}`);
  return info;
}

export function currencyExponent(code: string): number {
  return currencyInfo(code).exponent;
}
