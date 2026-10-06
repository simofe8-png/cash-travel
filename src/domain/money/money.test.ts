import { SUPPORTED_CURRENCIES, currencyExponent, isSupportedCurrency } from './currency';
import { compare, divide, divRoundHalfUp, parseDecimal, toDecimalString } from './decimal';
import {
  add,
  convert,
  convertByRatio,
  effectiveRate,
  formatAmount,
  money,
  negate,
  parseAmount,
  subtract,
  sum,
  toMajorString,
} from './money';

describe('currency metadata', () => {
  it.each([
    ['ILS', 2],
    ['USD', 2],
    ['EUR', 2],
    ['THB', 2],
    ['JPY', 0],
    ['KRW', 0],
    ['JOD', 3],
  ])('%s has ISO exponent %i', (code, exp) => {
    expect(currencyExponent(code)).toBe(exp);
  });

  it('has unique codes and Hebrew names', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of SUPPORTED_CURRENCIES) expect(c.nameHe.length).toBeGreaterThan(0);
  });

  it('rejects unknown currencies', () => {
    expect(isSupportedCurrency('XXX')).toBe(false);
    expect(() => money(1, 'XXX')).toThrow();
    expect(() => currencyExponent('usd')).toThrow();
  });
});

describe('Money', () => {
  it('requires safe integer minor units (no float money)', () => {
    expect(() => money(1.5, 'ILS')).toThrow();
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'ILS')).toThrow();
    expect(money(Number.MAX_SAFE_INTEGER, 'ILS').minor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('adds/subtracts exactly where floats would drift', () => {
    // 0.1 + 0.2 as ILS minor units
    expect(add(money(10, 'ILS'), money(20, 'ILS')).minor).toBe(30);
    const many = Array.from({ length: 1000 }, () => money(1, 'USD'));
    expect(sum(many, 'USD').minor).toBe(1000);
    expect(subtract(money(85000, 'THB'), money(100000, 'THB')).minor).toBe(-15000);
    expect(negate(money(5, 'EUR')).minor).toBe(-5);
  });

  it('refuses cross-currency arithmetic', () => {
    expect(() => add(money(1, 'ILS'), money(1, 'USD'))).toThrow(/mismatch/);
  });

  it('detects overflow beyond safe range', () => {
    expect(() => add(money(Number.MAX_SAFE_INTEGER, 'ILS'), money(1, 'ILS'))).toThrow();
  });
});

describe('parseAmount', () => {
  it.each([
    ['850', 'THB', 85000],
    ['850.5', 'THB', 85050],
    ['850,50', 'THB', 85050],
    ['1,234.56', 'USD', 123456],
    ['1,234,567', 'ILS', 123456700],
    ['0.01', 'EUR', 1],
    ['.5', 'EUR', 50],
    ['12.', 'EUR', 1200],
    ['500', 'JPY', 500],
    ['1.234', 'JOD', 1234],
    [' 7 000 ', 'THB', 700000],
    ['⁦1,000.00⁩', 'USD', 100000],
  ])('"%s" %s → %i', (text, ccy, minor) => {
    expect(parseAmount(text, ccy)).toEqual({ ok: true, minor });
  });

  it('never silently rounds user input', () => {
    expect(parseAmount('1.005', 'USD')).toEqual({ ok: false, error: 'too_many_decimals' });
    expect(parseAmount('500.5', 'JPY')).toEqual({ ok: false, error: 'too_many_decimals' });
    // A lone comma is a decimal separator; "1,000" in USD is therefore rejected, not read as 1000 or 1.
    expect(parseAmount('1,000', 'USD')).toEqual({ ok: false, error: 'too_many_decimals' });
  });

  it.each(['', '   ', 'abc', '1.2.3', '12a', '1,23.4', '--5', '1e5', 'NaN', 'Infinity'])(
    'rejects "%s"',
    (text) => {
      expect(parseAmount(text, 'USD').ok).toBe(false);
    },
  );

  it('handles sign rules', () => {
    expect(parseAmount('-300', 'THB')).toEqual({ ok: false, error: 'negative_not_allowed' });
    expect(parseAmount('-300', 'THB', { allowNegative: true })).toEqual({ ok: true, minor: -30000 });
    expect(parseAmount('−300', 'THB', { allowNegative: true })).toEqual({ ok: true, minor: -30000 });
  });

  it('rejects amounts beyond safe integer range', () => {
    expect(parseAmount('99999999999999999', 'USD')).toEqual({ ok: false, error: 'too_large' });
  });
});

describe('formatting', () => {
  it.each([
    [123450, 'THB', '1234.50', '1,234.50'],
    [-5, 'JPY', '-5', '-5'],
    [5, 'USD', '0.05', '0.05'],
    [-123456789, 'ILS', '-1234567.89', '-1,234,567.89'],
    [1234, 'JOD', '1.234', '1.234'],
    [0, 'EUR', '0.00', '0.00'],
  ])('%i %s', (minor, ccy, major, grouped) => {
    expect(toMajorString(money(minor, ccy))).toBe(major);
    expect(formatAmount(money(minor, ccy))).toBe(grouped);
  });
});

describe('Decimal', () => {
  it('parses and normalizes', () => {
    expect(toDecimalString(parseDecimal('3.6700'))).toBe('3.67');
    expect(toDecimalString(parseDecimal('0.000123'))).toBe('0.000123');
    expect(toDecimalString(parseDecimal('-12'))).toBe('-12');
    expect(() => parseDecimal('1e5')).toThrow();
    expect(() => parseDecimal('')).toThrow();
  });

  it('rounds half away from zero', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
    expect(divRoundHalfUp(-4n, 3n)).toBe(-1n);
    expect(() => divRoundHalfUp(1n, 0n)).toThrow();
  });

  it('divides and compares exactly', () => {
    expect(toDecimalString(divide(parseDecimal('1'), parseDecimal('3'), 6))).toBe('0.333333');
    expect(toDecimalString(divide(parseDecimal('2'), parseDecimal('3'), 6))).toBe('0.666667');
    expect(compare(parseDecimal('1.10'), parseDecimal('1.1'))).toBe(0);
    expect(compare(parseDecimal('0.9'), parseDecimal('1'))).toBe(-1);
  });
});

describe('conversion (single final rounding)', () => {
  it('converts USD→ILS', () => {
    expect(convert(money(100000, 'USD'), parseDecimal('3.6789'), 'ILS')).toEqual(money(367890, 'ILS'));
  });

  it('converts THB→ILS with half-up at the ILS boundary', () => {
    // 850 THB × 0.1035 = 87.975 ILS → 87.98
    expect(convert(money(85000, 'THB'), parseDecimal('0.1035'), 'ILS').minor).toBe(8798);
  });

  it('converts across exponents (JPY 0 ↔ ILS 2 ↔ JOD 3)', () => {
    expect(convert(money(1000, 'JPY'), parseDecimal('0.0247'), 'ILS').minor).toBe(2470);
    expect(convert(money(10000, 'ILS'), parseDecimal('40.5'), 'JPY').minor).toBe(4050);
    expect(convert(money(1000, 'JOD'), parseDecimal('5.18'), 'ILS').minor).toBe(518);
  });

  it('converts negative amounts symmetrically', () => {
    expect(convert(money(-85000, 'THB'), parseDecimal('0.1035'), 'ILS').minor).toBe(-8798);
  });

  it('cross-rate via base has no intermediate rounding', () => {
    // EUR base: 1 EUR = 38.123 THB, 1 EUR = 4.0127 ILS → THB→ILS = 4.0127 / 38.123
    const thb = money(10_000_000, 'THB'); // 100,000 THB
    const r = convertByRatio(thb, parseDecimal('4.0127'), parseDecimal('38.123'), 'ILS');
    // 100000 × 4.0127 / 38.123 = 10525.666... ILS → 1052567 minor
    expect(r.minor).toBe(1052567);
    // Rounding the cross-rate first (to 4 dp: 0.1053) would give 10530.00 — prove we don't.
    expect(convert(thb, parseDecimal('0.1053'), 'ILS').minor).not.toBe(r.minor);
  });

  it('rejects a zero denominator', () => {
    expect(() => convertByRatio(money(1, 'USD'), parseDecimal('1'), parseDecimal('0'), 'ILS')).toThrow();
  });
});

describe('effective rate', () => {
  it('derives from actual given/received', () => {
    expect(toDecimalString(effectiveRate(money(100000, 'USD'), money(3200000, 'THB')))).toBe('32');
    expect(toDecimalString(effectiveRate(money(10000, 'ILS'), money(4050, 'JPY')))).toBe('40.5');
    expect(toDecimalString(effectiveRate(money(30000, 'USD'), money(1000000, 'THB'), 4))).toBe('33.3333');
  });

  it('requires positive amounts', () => {
    expect(() => effectiveRate(money(0, 'USD'), money(1, 'THB'))).toThrow();
  });
});
