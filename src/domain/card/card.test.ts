import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveQuote, type ReferenceRate } from '../fx';
import { money } from '../money';
import { estimateCardCharge, type EstimateInput } from './estimate';
import { compareVersions, parseClassification, validateRuleSet, type CardRuleSet } from './rules';

const RATES: ReferenceRate[] = [
  { source: 'ECB', quote: 'ILS', rate: '3.431', rateDate: '2026-10-05' },
  { source: 'ECB', quote: 'THB', rate: '37.752', rateDate: '2026-10-05' },
  { source: 'ECB', quote: 'USD', rate: '1.1204', rateDate: '2026-10-05' },
];
const quote = (from: string, to: string) => resolveQuote(from, to, '2026-10-05', RATES, ['ECB']);
const noRates = () => null;

const rules = (fee: string | null = null): CardRuleSet => ({
  version: '2026.10.1',
  source: 'test',
  effectiveFrom: '2026-10-01',
  issuers: {
    ISRACARD: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: fee },
    MAX: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
    CAL: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
    OTHER: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
  },
});

const base = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  original: money(500000, 'THB'), // 5,000 THB
  chargedIn: null,
  card: { issuer: 'ISRACARD', classification: 'UNKNOWN', billingCurrency: 'ILS' },
  rules: rules(),
  kind: 'PURCHASE',
  quote,
  now: '2026-10-05T10:00:00.000Z',
  ...over,
});

// 5,000 THB × 3.431 / 37.752 = 454.4130… ILS (expectations computed exactly with BigInt)
describe('Card Cost Engine — estimates', () => {
  it('unknown fee: estimate at reference rate, honestly marked fee UNKNOWN', () => {
    expect(estimateCardCharge(base())).toMatchObject({
      status: 'ESTIMATED',
      estimateMinor: 45441,
      feeStatus: 'UNKNOWN',
      billingCurrency: 'ILS',
      chargedCurrency: 'THB',
      chargedAmountMinor: 500000,
      rateSource: 'ECB',
      rateDate: '2026-10-05',
      rate: '0.0908826',
      ruleSetVersion: '2026.10.1',
      ruleId: 'ISRACARD:UNKNOWN',
    });
  });

  it('classified fee percent is included with a single final rounding', () => {
    // 454.4130… × 1.03 = 468.0454… → 468.05
    const e = estimateCardCharge(base({ card: { issuer: 'ISRACARD', classification: 'FEE_PERCENT:3', billingCurrency: 'ILS' } }));
    expect(e).toMatchObject({ estimateMinor: 46805, feeStatus: 'INCLUDED', ruleId: 'ISRACARD:FEE_PERCENT' });
    const e2 = estimateCardCharge(base({ card: { issuer: 'MAX', classification: 'FEE_PERCENT:2.75', billingCurrency: 'ILS' } }));
    // 454.4130… × 1.0275 = 466.9094… → 466.91
    expect(e2.estimateMinor).toBe(46691);
  });

  it('NO_FOREIGN_FEE → fee NONE', () => {
    expect(estimateCardCharge(base({ card: { issuer: 'CAL', classification: 'NO_FOREIGN_FEE', billingCurrency: 'ILS' } }))).toMatchObject({
      estimateMinor: 45441,
      feeStatus: 'NONE',
    });
  });

  it('issuer default fee comes only from rule data', () => {
    expect(estimateCardCharge(base({ rules: rules('1.5') }))).toMatchObject({ feeStatus: 'INCLUDED', estimateMinor: 46123 });
    expect(estimateCardCharge(base({ rules: null }))).toMatchObject({ feeStatus: 'UNKNOWN', ruleSetVersion: null });
  });

  it('no cached rate → UNAVAILABLE, never invented', () => {
    expect(estimateCardCharge(base({ quote: noRates }))).toMatchObject({
      status: 'UNAVAILABLE',
      estimateMinor: null,
      rate: null,
      chargedAmountMinor: 500000,
    });
  });

  it('billing-currency purchase needs no rate', () => {
    expect(estimateCardCharge(base({ original: money(12345, 'ILS'), quote: noRates }))).toMatchObject({
      status: 'UNAVAILABLE', // identity quote is resolved by the service; raw domain with no quote is honest
    });
    expect(estimateCardCharge(base({ original: money(12345, 'ILS'), quote: (f, t) => resolveQuote(f, t, '2026-10-05', [], []) }))).toMatchObject({
      status: 'ESTIMATED',
      estimateMinor: 12345,
      rate: '1',
      rateSource: 'IDENTITY',
    });
  });

  it('DCC charged in ILS with known amount: the charged amount is the basis', () => {
    const e = estimateCardCharge(base({ chargedIn: { currency: 'ILS', amountMinor: 47900 }, quote: (f, t) => (f === t ? resolveQuote(f, t, 'x', [], []) : quote(f, t)) }));
    expect(e).toMatchObject({ chargedCurrency: 'ILS', chargedAmountMinor: 47900, estimateMinor: 47900, status: 'ESTIMATED' });
  });

  it('DCC in another currency with unknown amount: original amount basis, markup unknown', () => {
    const e = estimateCardCharge(base({ chargedIn: { currency: 'USD', amountMinor: null }, card: { issuer: 'CAL', classification: 'NO_FOREIGN_FEE', billingCurrency: 'ILS' } }));
    expect(e).toMatchObject({ chargedCurrency: 'USD', chargedAmountMinor: null, estimateMinor: 45441, feeStatus: 'UNKNOWN' });
  });

  it('DCC in USD with known amount converts the USD charge', () => {
    // 150 USD × 3.431 / 1.1204 = 459.3448… → 459.34
    const e = estimateCardCharge(base({ chargedIn: { currency: 'USD', amountMinor: 15000 } }));
    expect(e).toMatchObject({ chargedCurrency: 'USD', chargedAmountMinor: 15000, estimateMinor: 45934 });
  });

  it('ATM estimates never claim fees are fully known', () => {
    const e = estimateCardCharge(base({ kind: 'ATM', card: { issuer: 'MAX', classification: 'NO_FOREIGN_FEE', billingCurrency: 'ILS' } }));
    expect(e.feeStatus).toBe('UNKNOWN');
  });

  it('unspecified card defaults to ILS billing and unknown fees', () => {
    expect(estimateCardCharge(base({ card: null }))).toMatchObject({ billingCurrency: 'ILS', feeStatus: 'UNKNOWN', ruleId: 'OTHER:UNKNOWN' });
  });
});

describe('Card rules model', () => {
  it('parses classifications strictly', () => {
    expect(parseClassification('UNKNOWN')).toEqual({ kind: 'UNKNOWN' });
    expect(parseClassification('NO_FOREIGN_FEE')).toEqual({ kind: 'NO_FOREIGN_FEE' });
    expect(parseClassification('FEE_PERCENT:3.5')?.kind).toBe('FEE_PERCENT');
    for (const bad of ['FEE_PERCENT:0', 'FEE_PERCENT:11', 'FEE_PERCENT:3.555', 'FEE_PERCENT:-1', '4111111111111111', 'GOLD']) {
      expect(parseClassification(bad)).toBeNull();
    }
  });

  it('validates rule-set documents before activation', () => {
    expect(validateRuleSet(rules())).not.toBeNull();
    expect(validateRuleSet({ ...rules(), version: 'v1' })).toBeNull();
    expect(validateRuleSet({ ...rules(), effectiveFrom: '2026-13-01' })).toBeNull();
    expect(validateRuleSet({ ...rules(), issuers: { ...rules().issuers, MAX: { conversionBasis: 'MAGIC', defaultFeePercent: null } } })).toBeNull();
    expect(validateRuleSet({ ...rules(), issuers: { ...rules().issuers, CAL: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: '50' } } })).toBeNull();
    expect(validateRuleSet(null)).toBeNull();
  });

  it('compares versions numerically', () => {
    expect(compareVersions('2026.10.2', '2026.10.10')).toBe(-1);
    expect(compareVersions('2027.1.1', '2026.12.9')).toBe(1);
    expect(compareVersions('2026.10.1', '2026.10.1')).toBe(0);
  });

  it('business logic contains no hardcoded fee percentage', () => {
    for (const f of ['estimate.ts', 'rules.ts']) {
      const code = readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code).not.toMatch(/FEE_PERCENT:\d|\b[1-9]\.\d+\s*%|defaultFeePercent:\s*'\d/);
    }
  });
});
