import type { JournalRow } from '../application/ports/JournalQueries';
import type { Category } from '../domain/expense';
import { money } from '../domain/money';
import { localTimeOf } from '../domain/time';
import type { IconName } from './components/primitives';
import { formatMoney } from './format';
import { categoryLabel, he } from './i18n/he';
import { colors } from './theme/tokens';

const CATEGORY_ICONS: Record<string, IconName> = {
  food: 'silverware-fork-knife',
  bed: 'bed-outline',
  bus: 'bus',
  ticket: 'ticket-outline',
  bag: 'shopping-outline',
  dots: 'dots-horizontal',
  tag: 'tag-outline',
  gift: 'gift-outline',
  heart: 'heart-outline',
  phone: 'cellphone',
  coffee: 'coffee-outline',
  beach: 'beach',
};

export function categoryIcon(icon: string): IconName {
  return CATEGORY_ICONS[icon] ?? 'tag-outline';
}

export interface ActionPresentation {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly iconColor: string;
  readonly amountText: string;
  readonly amountColor: string;
}

/** How a transaction reads in lists: plain language, no accounting terms. */
export function presentAction(r: JournalRow, categories: ReadonlyMap<number, Category>): ActionPresentation {
  const primary = money(r.amountMinor, r.currency);
  const time = localTimeOf({ occurredAt: r.occurredAt, occurredLocalDate: r.localDate, tzOffsetMin: r.tzOffsetMin });
  const extras = [time, r.place].filter(Boolean) as string[];
  switch (r.type) {
    case 'EXPENSE': {
      const cat = r.categoryId !== null ? categories.get(r.categoryId) : undefined;
      const label = cat ? categoryLabel(cat) : he.types.EXPENSE;
      return {
        title: r.description || label,
        subtitle: [r.description ? label : null, r.paymentMethod === 'CARD' ? he.payment.CARD : he.payment.CASH, ...extras].filter(Boolean).join(' · '),
        icon: cat ? categoryIcon(cat.icon) : 'cash',
        iconColor: r.paymentMethod === 'CARD' ? colors.card : colors.primary,
        amountText: formatMoney(primary),
        amountColor: colors.ink,
      };
    }
    case 'FX_EXCHANGE':
      return {
        title: he.types.FX_EXCHANGE,
        subtitle: extras.join(' · '),
        icon: 'swap-horizontal',
        iconColor: colors.fx,
        amountText: `${formatMoney(primary)} ← ${formatMoney(money(r.counterAmountMinor ?? 0, r.counterCurrency ?? r.currency))}`,
        amountColor: colors.ink,
      };
    case 'ATM_WITHDRAWAL':
      return {
        title: he.types.ATM_WITHDRAWAL,
        subtitle: extras.join(' · '),
        icon: 'cash-plus',
        iconColor: colors.atm,
        amountText: formatMoney(primary, { signed: true }),
        amountColor: colors.success,
      };
    case 'CASH_ADJUSTMENT':
      return {
        title: he.types.CASH_ADJUSTMENT,
        subtitle: [r.note, ...extras].filter(Boolean).join(' · '),
        icon: 'scale-balance',
        iconColor: colors.warning,
        amountText: formatMoney(primary, { signed: true }),
        amountColor: primary.minor < 0 ? colors.danger : colors.success,
      };
    case 'OPENING_BALANCE':
      return {
        title: he.types.OPENING_BALANCE,
        subtitle: extras.join(' · '),
        icon: 'wallet-outline',
        iconColor: colors.inkMuted,
        amountText: formatMoney(primary, { signed: true }),
        amountColor: colors.inkMuted,
      };
  }
}
