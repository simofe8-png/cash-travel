export type CardIssuer = 'ISRACARD' | 'MAX' | 'CAL' | 'OTHER';

/** Minimal card identity. Never a payment credential (no number/CVV/expiry/last four). */
export interface Card {
  readonly id: number;
  readonly issuer: CardIssuer;
  readonly classification: string;
  readonly nickname: string | null;
  readonly billingCurrency: string;
  readonly archived: boolean;
}

export interface CardRepository {
  listActive(): Card[];
  get(id: number): Card | undefined;
  create(card: Omit<Card, 'id' | 'archived'>): number;
  update(id: number, card: Omit<Card, 'id' | 'archived'>): void;
  archive(id: number): void;
}
