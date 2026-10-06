import type { CardRuleSet } from '../../domain/card';

export interface CardRuleRepository {
  /** Stores a validated rule set if its version is new. Returns true when inserted. */
  saveIfNew(rules: CardRuleSet, loadedAt: string): boolean;
  /** Highest-version rule set effective on or before `date`. */
  activeOn(date: string): CardRuleSet | null;
}
