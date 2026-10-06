import type { CardRuleRepository } from '../application/ports/CardRuleRepository';
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import { compareVersions, validateRuleSet, type CardRuleSet } from '../domain/card';

export class SqliteCardRuleRepository implements CardRuleRepository {
  constructor(private readonly db: SqlDatabase) {}

  saveIfNew(r: CardRuleSet, loadedAt: string): boolean {
    return (
      this.db.run(
        'INSERT INTO card_rule_sets (version, source, effective_from, payload, loaded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(version) DO NOTHING',
        [r.version, r.source, r.effectiveFrom, JSON.stringify(r), loadedAt],
      ).changes === 1
    );
  }

  activeOn(date: string): CardRuleSet | null {
    const rows = this.db.all<{ version: string; payload: string }>('SELECT version, payload FROM card_rule_sets WHERE effective_from <= ?', [date]);
    rows.sort((a, b) => compareVersions(b.version, a.version));
    for (const row of rows) {
      const valid = validateRuleSet(JSON.parse(row.payload));
      if (valid) return valid;
    }
    return null;
  }
}
