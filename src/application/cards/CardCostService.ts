import { estimateCardCharge, validateRuleSet, type ChargedIn } from '../../domain/card';
import type { CardChargeEstimate } from '../../domain/ledger';
import type { Money } from '../../domain/money';
import type { FxRateService } from '../fx/FxRateService';
import type { CardRepository } from '../ports/CardRepository';
import type { CardRuleRepository } from '../ports/CardRuleRepository';
import type { Clock } from '../ports/Clock';

/**
 * Card Cost Engine application service. Estimates are computed from locally cached rates and
 * locally stored rules only — never from the network — so card entry works offline.
 */
export class CardCostService {
  constructor(
    private readonly cards: CardRepository,
    private readonly rules: CardRuleRepository,
    private readonly fx: FxRateService,
    private readonly clock: Clock,
  ) {}

  /** Controlled rule update: activates a bundled/updated rule set only if it validates. */
  installRuleSet(doc: unknown): boolean {
    const valid = validateRuleSet(doc);
    if (!valid) return false;
    this.rules.saveIfNew(valid, this.clock.now());
    return true;
  }

  estimate(input: { original: Money; chargedIn: ChargedIn | null; cardId: number | null; date: string; kind: 'PURCHASE' | 'ATM' }): CardChargeEstimate {
    const card = input.cardId !== null ? this.cards.get(input.cardId) ?? null : null;
    return estimateCardCharge({
      original: input.original,
      chargedIn: input.chargedIn,
      card,
      rules: this.rules.activeOn(input.date),
      kind: input.kind,
      quote: (from, to) => this.fx.quote(from, to, input.date),
      now: this.clock.now(),
    });
  }
}
