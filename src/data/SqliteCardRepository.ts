import type { Card, CardIssuer, CardRepository } from '../application/ports/CardRepository';
import type { SqlDatabase } from '../application/ports/SqlDatabase';

interface Row {
  id: number;
  issuer: CardIssuer;
  classification: string;
  nickname: string | null;
  billing_currency: string;
  archived_at: string | null;
}

const toCard = (r: Row): Card => ({
  id: r.id,
  issuer: r.issuer,
  classification: r.classification,
  nickname: r.nickname,
  billingCurrency: r.billing_currency,
  archived: r.archived_at !== null,
});

export class SqliteCardRepository implements CardRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => string,
  ) {}

  listActive(): Card[] {
    return this.db.all<Row>('SELECT * FROM cards WHERE archived_at IS NULL ORDER BY id').map(toCard);
  }

  get(id: number): Card | undefined {
    const r = this.db.get<Row>('SELECT * FROM cards WHERE id = ?', [id]);
    return r ? toCard(r) : undefined;
  }

  create(c: Omit<Card, 'id' | 'archived'>): number {
    return this.db.run('INSERT INTO cards (issuer, classification, nickname, billing_currency, created_at) VALUES (?, ?, ?, ?, ?)', [
      c.issuer,
      c.classification,
      c.nickname?.trim() || null,
      c.billingCurrency,
      this.now(),
    ]).lastInsertRowId;
  }

  update(id: number, c: Omit<Card, 'id' | 'archived'>): void {
    const n = this.db.run('UPDATE cards SET issuer = ?, classification = ?, nickname = ?, billing_currency = ? WHERE id = ?', [
      c.issuer,
      c.classification,
      c.nickname?.trim() || null,
      c.billingCurrency,
      id,
    ]).changes;
    if (n !== 1) throw new Error(`Card ${id} not found`);
  }

  /** Cards are archived, never deleted, so past transactions keep their card reference. */
  archive(id: number): void {
    this.db.run('UPDATE cards SET archived_at = ? WHERE id = ? AND archived_at IS NULL', [this.now(), id]);
  }
}
