import { CARD_ISSUERS, isValidClassification, type CardIssuerCode } from '../../domain/card';
import { isSupportedCurrency } from '../../domain/money';
import type { Card, CardRepository } from '../ports/CardRepository';

export interface CardInput {
  readonly issuer: CardIssuerCode;
  /** 'UNKNOWN' | 'NO_FOREIGN_FEE' | 'FEE_PERCENT:<0–10, ≤2 dp>' */
  readonly classification: string;
  readonly nickname: string | null;
  readonly billingCurrency: string;
}

export class CardError extends Error {
  constructor(readonly code: 'INVALID_ISSUER' | 'INVALID_CLASSIFICATION' | 'INVALID_CURRENCY' | 'NICKNAME_TOO_LONG') {
    super(code);
    this.name = 'CardError';
  }
}

/** Minimal card identity management. Never collects card numbers, CVV, expiry or last four digits. */
export class CardService {
  constructor(private readonly cards: CardRepository) {}

  list(): Card[] {
    return this.cards.listActive();
  }

  get(id: number): Card | undefined {
    return this.cards.get(id);
  }

  create(input: CardInput): number {
    this.validate(input);
    return this.cards.create(input);
  }

  update(id: number, input: CardInput): void {
    this.validate(input);
    this.cards.update(id, input);
  }

  archive(id: number): void {
    this.cards.archive(id);
  }

  private validate(c: CardInput): void {
    if (!(CARD_ISSUERS as readonly string[]).includes(c.issuer)) throw new CardError('INVALID_ISSUER');
    if (!isValidClassification(c.classification)) throw new CardError('INVALID_CLASSIFICATION');
    if (!isSupportedCurrency(c.billingCurrency)) throw new CardError('INVALID_CURRENCY');
    if ((c.nickname?.trim().length ?? 0) > 30) throw new CardError('NICKNAME_TOO_LONG');
  }
}
