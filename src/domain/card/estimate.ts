import type { RateQuote } from '../fx';
import type { CardChargeEstimate } from '../ledger';
import { convertByRatio, divide, multiply, parseDecimal, toDecimalString, type Decimal, type Money } from '../money';
import { parseClassification, type CardIssuerCode, type CardRuleSet } from './rules';

export interface CardForEstimate {
  readonly issuer: CardIssuerCode;
  readonly classification: string;
  readonly billingCurrency: string;
}

/** "Charged in another currency" (DCC): the currency the merchant actually charged, and amount if known. */
export interface ChargedIn {
  readonly currency: string;
  readonly amountMinor: number | null;
}

export interface EstimateInput {
  /** Amount the card is charged in the transaction currency (expense amount, or ATM principal + fee). */
  readonly original: Money;
  readonly chargedIn: ChargedIn | null;
  /** Unknown card (unspecified) → billing ILS, classification UNKNOWN, issuer OTHER. */
  readonly card: CardForEstimate | null;
  readonly rules: CardRuleSet | null;
  readonly kind: 'PURCHASE' | 'ATM';
  /** Offline reference-rate lookup (from → to). */
  readonly quote: (from: string, to: string) => RateQuote | null;
  readonly now: string;
}

const HUNDRED: Decimal = { coef: 100n, scale: 0 };
const UNKNOWN_CARD: CardForEstimate = { issuer: 'OTHER', classification: 'UNKNOWN', billingCurrency: 'ILS' };

/**
 * Card Cost Engine: estimated billing-currency charge. Honest about uncertainty — the fee status
 * says whether a fee is included, known to be none, or unknown (estimate then excludes it).
 * Never invents a rate or a fee; if no reference rate is cached the estimate is UNAVAILABLE.
 */
export function estimateCardCharge(i: EstimateInput): CardChargeEstimate {
  const card = i.card ?? UNKNOWN_CARD;
  const billing = card.billingCurrency;
  const dcc = i.chargedIn && i.chargedIn.currency !== i.original.currency ? i.chargedIn : null;
  const chargedCurrency = dcc ? dcc.currency : i.original.currency;
  const chargedAmountMinor = dcc ? dcc.amountMinor : i.original.minor;

  // Basis: what the card was actually charged. A DCC charge with unknown amount falls back to the
  // original amount, but the merchant's DCC markup is then unknown.
  const basis: Money = dcc && dcc.amountMinor !== null ? { minor: dcc.amountMinor, currency: dcc.currency } : i.original;
  const dccMarkupUnknown = dcc !== null && dcc.amountMinor === null;

  // Fee: the card's classification wins; else the issuer default from the rule set; else unknown.
  const cls = parseClassification(card.classification) ?? { kind: 'UNKNOWN' as const };
  let feePercent: Decimal | null = null;
  let feeKnown = false;
  if (cls.kind === 'NO_FOREIGN_FEE') {
    feePercent = { coef: 0n, scale: 0 };
    feeKnown = true;
  } else if (cls.kind === 'FEE_PERCENT') {
    feePercent = cls.percent;
    feeKnown = true;
  } else {
    const def = i.rules?.issuers[card.issuer]?.defaultFeePercent ?? null;
    if (def !== null) {
      feePercent = parseDecimal(def);
      feeKnown = true;
    }
  }
  // ATM withdrawals may carry issuer cash-withdrawal fees beyond the purchase fee: never "fully known".
  const feeStatus: CardChargeEstimate['feeStatus'] =
    !feeKnown || dccMarkupUnknown || i.kind === 'ATM' ? 'UNKNOWN' : feePercent!.coef === 0n ? 'NONE' : 'INCLUDED';

  const base = {
    billingCurrency: billing,
    chargedCurrency,
    chargedAmountMinor,
    feeStatus,
    ruleSetVersion: i.rules?.version ?? null,
    ruleId: `${card.issuer}:${cls.kind}`,
  };

  const q = i.quote(basis.currency, billing);
  if (!q) {
    return { ...base, status: 'UNAVAILABLE', estimateMinor: null, rate: null, rateSource: null, rateDate: null, estimatedAt: null };
  }
  // estimate = basis × rate × (100 + fee%) / 100, rounded once at the billing currency boundary.
  const factor = feePercent ? { coef: 100n * 10n ** BigInt(feePercent.scale) + feePercent.coef, scale: feePercent.scale } : HUNDRED;
  const estimate = convertByRatio(basis, multiply(q.numerator, factor), multiply(q.denominator, HUNDRED), billing);
  return {
    ...base,
    status: estimate.minor > 0 ? 'ESTIMATED' : 'UNAVAILABLE',
    estimateMinor: estimate.minor > 0 ? estimate.minor : null,
    rate: q.source === 'IDENTITY' ? '1' : rateString(q),
    rateSource: q.source,
    rateDate: q.rateDate,
    estimatedAt: i.now,
  };
}

/** Display/provenance only: the exact ratio expressed to 8 dp. */
function rateString(q: RateQuote): string {
  return toDecimalString(divide(q.numerator, q.denominator, 8));
}
