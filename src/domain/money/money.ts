import { currencyExponent, isSupportedCurrency } from './currency';
import { Decimal, divRoundHalfUp, divide, pow10 } from './decimal';

/**
 * Authoritative money value: an integer number of minor units plus a currency code.
 * `minor` is always a safe integer; arithmetic on it is exact. Floats never represent money.
 */
export interface Money {
  readonly minor: number;
  readonly currency: string;
}

function assertSafe(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new Error(`Money minor units must be a safe integer: ${minor}`);
}

export function money(minor: number, currency: string): Money {
  assertSafe(minor);
  if (!isSupportedCurrency(currency)) throw new Error(`Unsupported currency: ${currency}`);
  return { minor, currency };
}

export function zero(currency: string): Money {
  return money(0, currency);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export type ParseResult =
  | { ok: true; minor: number }
  | { ok: false; error: 'empty' | 'invalid' | 'too_many_decimals' | 'negative_not_allowed' | 'too_large' };

/**
 * Parses user-typed amount text into minor units, exactly. Accepts "1234", "1234.5", "1,234.50",
 * "1234,5" (decimal comma), "7,000" (thousands grouping). Rejects more fractional digits than the currency
 * allows instead of silently rounding user input.
 */
export function parseAmount(text: string, currency: string, opts: { allowNegative?: boolean } = {}): ParseResult {
  let s = text.replace(/[\s ‎‏⁦-⁩]/g, '');
  if (s === '') return { ok: false, error: 'empty' };
  let neg = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (neg && !opts.allowNegative) return { ok: false, error: 'negative_not_allowed' };

  const hasDot = s.includes('.');
  const commas = (s.match(/,/g) ?? []).length;
  if (hasDot) {
    // Commas are grouping separators: must sit in valid 3-digit groups before the dot.
    const [intPart = '', ...rest] = s.split('.');
    if (rest.length !== 1) return { ok: false, error: 'invalid' };
    if (commas > 0 && !/^\d{1,3}(,\d{3})+$/.test(intPart)) return { ok: false, error: 'invalid' };
    s = `${intPart.replace(/,/g, '')}.${rest[0]}`;
  } else if (commas > 0) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      // Thousands grouping (Israeli/US convention): "7,000" = 7000.
      s = s.replace(/,/g, '');
    } else if (commas === 1 && /^\d*,\d{1,2}$/.test(s)) {
      // Decimal comma: "12,5" = 12.5.
      s = s.replace(',', '.');
    } else {
      return { ok: false, error: 'invalid' };
    }
  }
  if (!/^\d+(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) return { ok: false, error: 'invalid' };

  const [int = '', frac = ''] = s.split('.');
  const exp = currencyExponent(currency);
  if (frac.length > exp) return { ok: false, error: 'too_many_decimals' };
  const minorBig = BigInt(`${int || '0'}${frac.padEnd(exp, '0')}`);
  if (minorBig > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'too_large' };
  const minor = Number(minorBig);
  return { ok: true, minor: neg ? -minor : minor };
}

/** Exact major-unit decimal string, e.g. 123450 THB → "1234.50", -5 JPY → "-5". */
export function toMajorString(m: Money): string {
  const exp = currencyExponent(m.currency);
  const neg = m.minor < 0;
  const digits = Math.abs(m.minor).toString().padStart(exp + 1, '0');
  const int = digits.slice(0, digits.length - exp);
  const frac = digits.slice(digits.length - exp);
  return `${neg ? '-' : ''}${int}${exp > 0 ? `.${frac}` : ''}`;
}

/** Grouped display string without currency, e.g. "1,234.50". Exact (string-based). */
export function formatAmount(m: Money): string {
  const major = toMajorString(m);
  const neg = major.startsWith('-');
  const [int = '0', frac] = (neg ? major.slice(1) : major).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac !== undefined ? `.${frac}` : ''}`;
}

/**
 * Converts an amount with an exact rate (1 unit of `m.currency` = `rate` units of `target`).
 * One rounding only, half away from zero, at the target currency's minor-unit boundary.
 */
export function convert(m: Money, rate: Decimal, target: string): Money {
  return convertByRatio(m, rate, { coef: 1n, scale: 0 }, target);
}

/**
 * Converts with an exact ratio rate = numerator / denominator, without intermediate rounding.
 * Used for cross-rates through a base currency: amount × (base→target) / (base→source).
 */
export function convertByRatio(m: Money, numerator: Decimal, denominator: Decimal, target: string): Money {
  if (denominator.coef === 0n) throw new Error('Rate denominator is zero');
  const fromExp = currencyExponent(m.currency);
  const toExp = currencyExponent(target);
  // target_minor = minor / 10^fromExp × (n.coef / 10^n.scale) / (d.coef / 10^d.scale) × 10^toExp
  const num = BigInt(m.minor) * numerator.coef * pow10(denominator.scale) * pow10(toExp);
  const den = denominator.coef * pow10(numerator.scale) * pow10(fromExp);
  const result = divRoundHalfUp(num, den);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Converted amount exceeds safe range');
  }
  return money(Number(result), target);
}

/**
 * Effective rate derived from actual amounts: how many units of `received` one unit of `given`
 * bought (in major units), rounded half-up to `scale` digits. Derived/display value only.
 */
export function effectiveRate(given: Money, received: Money, scale = 8): Decimal {
  if (given.minor <= 0 || received.minor <= 0) throw new Error('Effective rate requires positive amounts');
  const g: Decimal = { coef: BigInt(given.minor), scale: currencyExponent(given.currency) };
  const r: Decimal = { coef: BigInt(received.minor), scale: currencyExponent(received.currency) };
  return divide(r, g, scale);
}

