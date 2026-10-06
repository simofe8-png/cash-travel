import { I18nManager } from 'react-native';

import { money } from '../../domain/money';
import { AppText, Card, EmptyState, Icon, MoneyText, Row, Screen } from '../components/primitives';
import { formatDayHeader, formatMoney } from '../format';
import { colors } from '../theme/tokens';

/** Shell placeholder (Step 15) with an RTL/bidi probe; replaced by the real screen in later steps. */
export function Placeholder({ title, testID }: { title: string; testID: string }) {
  return (
    <Screen testID={testID}>
      <AppText variant="title">{title}</AppText>
      <Card>
        <AppText variant="label" color={colors.inkMuted}>{`isRTL=${String(I18nManager.isRTL)}`}</AppText>
        <AppText>{`שילמתי ${formatMoney(money(85000, 'THB'))} על Pad Thai ב-Chiang Mai`}</AppText>
        <Row justify="space-between">
          <AppText>יתרה</AppText>
          <MoneyText value={money(-123456, 'ILS')} variant="heading" />
        </Row>
        <Row>
          <Icon name="chevron-right" directional />
          <AppText>{formatDayHeader('2026-11-03')}</AppText>
        </Row>
      </Card>
      <EmptyState icon="hammer-wrench" title="בבנייה" />
    </Screen>
  );
}
