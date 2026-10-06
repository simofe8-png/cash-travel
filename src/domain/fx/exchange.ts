import { compare, effectiveRate, type Decimal, type Money } from '../money';

export interface ExchangeRateView {
  /** Units of the received currency obtained per 1 unit of the given currency. */
  readonly receivedPerGiven: Decimal;
  /** Units of the given currency paid per 1 unit of the received currency. */
  readonly givenPerReceived: Decimal;
  /** The direction whose rate is ≥ 1, which reads naturally ("1 USD = 32.00 THB"). */
  readonly display: { readonly from: string; readonly to: string; readonly rate: Decimal };
}

/**
 * Effective rate of an actual cash exchange, derived from the actual amounts given and received.
 * The amounts are the authoritative facts; the rate is a deterministic derived view (8 dp).
 */
export function exchangeRateView(given: Money, received: Money): ExchangeRateView {
  const receivedPerGiven = effectiveRate(given, received, 8);
  const givenPerReceived = effectiveRate(received, given, 8);
  const forward = compare(receivedPerGiven, { coef: 1n, scale: 0 }) >= 0;
  return {
    receivedPerGiven,
    givenPerReceived,
    display: forward
      ? { from: given.currency, to: received.currency, rate: receivedPerGiven }
      : { from: received.currency, to: given.currency, rate: givenPerReceived },
  };
}
