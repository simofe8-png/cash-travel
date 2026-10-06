/**
 * Bundled card-cost rule set (ADR-0005). Updated only by shipping a new version with an app update;
 * validated by `validateRuleSet` before activation. Issuer fees are plan-specific and were not
 * verifiable from current official sources at authoring time, so defaults are null (unknown):
 * estimates then exclude fees and say so, unless the user classifies the card.
 */
export const BUNDLED_CARD_RULE_SET: unknown = {
  version: '2026.10.1',
  source: 'Cash Travel bundled rules — conversion at ECB reference rate; issuer fees unverified (null)',
  effectiveFrom: '2026-10-01',
  issuers: {
    ISRACARD: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
    MAX: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
    CAL: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
    OTHER: { conversionBasis: 'REFERENCE_RATE', defaultFeePercent: null },
  },
};
