import { parseDecimal, compare, type Decimal } from '../money';
import { isValidDate } from '../time/dates';

export const CARD_ISSUERS = ['ISRACARD', 'MAX', 'CAL', 'OTHER'] as const;
export type CardIssuerCode = (typeof CARD_ISSUERS)[number];

/**
 * Versioned, data-driven card-cost rules (ADR-0005). Business logic reads fees only from here or
 * from the card's classification — never from constants in code.
 */
export interface CardRuleSet {
  readonly version: string;
  readonly source: string;
  readonly effectiveFrom: string;
  readonly issuers: Readonly<Record<CardIssuerCode, IssuerRule>>;
}

export interface IssuerRule {
  /** How a foreign amount becomes a billing-currency charge in the estimate. */
  readonly conversionBasis: 'REFERENCE_RATE';
  /** Issuer-wide default foreign-transaction fee (%) when verified; null = not known. */
  readonly defaultFeePercent: string | null;
}

/** The one optional classification asked per card. */
export type CardClassification =
  | { readonly kind: 'UNKNOWN' }
  | { readonly kind: 'NO_FOREIGN_FEE' }
  | { readonly kind: 'FEE_PERCENT'; readonly percent: Decimal };

const FEE_RE = /^FEE_PERCENT:(\d{1,2}(\.\d{1,2})?)$/;
const MAX_FEE: Decimal = { coef: 10n, scale: 0 };

export function parseClassification(s: string): CardClassification | null {
  if (s === 'UNKNOWN') return { kind: 'UNKNOWN' };
  if (s === 'NO_FOREIGN_FEE') return { kind: 'NO_FOREIGN_FEE' };
  const m = FEE_RE.exec(s);
  if (!m) return null;
  const percent = parseDecimal(m[1]!);
  if (compare(percent, MAX_FEE) > 0 || percent.coef <= 0n) return null;
  return { kind: 'FEE_PERCENT', percent };
}

export function isValidClassification(s: string): boolean {
  return parseClassification(s) !== null;
}

function isPercent(v: unknown): v is string | null {
  if (v === null) return true;
  if (typeof v !== 'string' || !/^\d{1,2}(\.\d{1,2})?$/.test(v)) return false;
  return compare(parseDecimal(v), MAX_FEE) <= 0;
}

/** Validates an untrusted rule-set document before it may become active. */
export function validateRuleSet(doc: unknown): CardRuleSet | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const d = doc as Record<string, unknown>;
  if (typeof d.version !== 'string' || !/^\d{4}\.\d{1,2}\.\d{1,3}$/.test(d.version)) return null;
  if (typeof d.source !== 'string' || d.source.trim().length === 0) return null;
  if (typeof d.effectiveFrom !== 'string' || !isValidDate(d.effectiveFrom)) return null;
  if (typeof d.issuers !== 'object' || d.issuers === null) return null;
  const issuers = d.issuers as Record<string, unknown>;
  for (const code of CARD_ISSUERS) {
    const r = issuers[code] as Record<string, unknown> | undefined;
    if (!r || r.conversionBasis !== 'REFERENCE_RATE' || !isPercent(r.defaultFeePercent)) return null;
  }
  return doc as CardRuleSet;
}

/** Compares dotted versions numerically ("2026.10.2" < "2026.10.10"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
