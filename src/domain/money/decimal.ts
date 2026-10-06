/**
 * Exact scaled decimal for FX rates: value = coef / 10^scale, with coef a BigInt. Never uses
 * floating point. Rates are persisted as canonical decimal strings (see toDecimalString).
 */
export interface Decimal {
  readonly coef: bigint;
  readonly scale: number;
}

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

export function parseDecimal(text: string): Decimal {
  const m = DECIMAL_RE.exec(text.trim());
  if (!m) throw new Error(`Invalid decimal: "${text}"`);
  const frac = m[3] ?? '';
  const coef = BigInt(`${m[2]}${frac}`) * (m[1] ? -1n : 1n);
  return normalize({ coef, scale: frac.length });
}

/** Removes trailing fractional zeros so equal values have one representation. */
export function normalize(d: Decimal): Decimal {
  let { coef, scale } = d;
  while (scale > 0 && coef % 10n === 0n) {
    coef /= 10n;
    scale -= 1;
  }
  return { coef, scale };
}

export function toDecimalString(d: Decimal): string {
  const n = normalize(d);
  const neg = n.coef < 0n;
  const digits = (neg ? -n.coef : n.coef).toString().padStart(n.scale + 1, '0');
  const int = digits.slice(0, digits.length - n.scale);
  const frac = digits.slice(digits.length - n.scale);
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

export function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new Error(`pow10 requires a non-negative integer: ${n}`);
  return 10n ** BigInt(n);
}

/** Integer division of BigInts rounding half away from zero (the single final rounding rule). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

export function multiply(a: Decimal, b: Decimal): Decimal {
  return normalize({ coef: a.coef * b.coef, scale: a.scale + b.scale });
}

/** a / b rounded half-up to `scale` fractional digits. Used only for derived/display rates. */
export function divide(a: Decimal, b: Decimal, scale: number): Decimal {
  if (b.coef === 0n) throw new Error('Division by zero');
  // a/b = (a.coef / 10^a.scale) / (b.coef / 10^b.scale); target coef = value × 10^scale.
  const num = a.coef * pow10(b.scale + scale);
  const den = b.coef * pow10(a.scale);
  return normalize({ coef: divRoundHalfUp(num, den), scale });
}

export function compare(a: Decimal, b: Decimal): number {
  const s = Math.max(a.scale, b.scale);
  const x = a.coef * pow10(s - a.scale);
  const y = b.coef * pow10(s - b.scale);
  return x === y ? 0 : x < y ? -1 : 1;
}
