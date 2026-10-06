import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Total } from '../../domain/reporting';
import { useQuery } from '../AppContext';
import { AppText, Card, EmptyState, Icon, Row, Screen, SectionTitle } from '../components/primitives';
import { formatMoney, formatRange, ltr } from '../format';
import { useRateRefresh } from '../hooks';
import { categoryLabel, he } from '../i18n/he';
import { categoryIcon } from '../present';
import { colors, radius, space } from '../theme/tokens';
import { TotalText } from './HomeScreen';

function Stat({ label, total, testID, hint }: { label: string; total: Total; testID: string; hint?: string }) {
  return (
    <Card style={styles.stat} testID={testID}>
      <AppText variant="label" color={colors.inkMuted}>
        {label}
      </AppText>
      <TotalText total={total} variant="heading" testID={`${testID}-value`} />
      {hint ? (
        <AppText variant="caption" color={colors.inkMuted}>
          {hint}
        </AppText>
      ) : null}
    </Card>
  );
}

export function SummaryScreen() {
  const data = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    if (!trip) return null;
    return {
      trip,
      spending: s.reportingService.spending(trip.id),
      categoryOf: (id: number) => s.categoryService.get(id),
      needs: s.reportingService.rateNeeds(trip.id),
    };
  });
  useRateRefresh(data?.needs ?? [], data?.trip.reportingCurrency ?? null);
  if (!data) return null;
  const { trip, spending: r } = data;
  const empty = r.totalTripCost.count + r.totalTripCost.unavailableCount === 0;

  // Presentation-only proportions for the cash/credit bar (no financial value is derived from them).
  const cashPart = Math.max(r.cash.amount.minor, 0);
  const cardPart = Math.max(r.card.amount.minor, 0);
  const whole = cashPart + cardPart;

  return (
    <Screen testID="screen-summary">
      <AppText variant="title">{he.tabs.summary}</AppText>
      <AppText variant="label" color={colors.inkMuted}>{`${trip.name} · ${formatRange(trip.startDate, trip.endDate)} · מוצג ב-${ltr(trip.reportingCurrency)}`}</AppText>

      {empty ? (
        <EmptyState icon="chart-donut" title="עוד אין הוצאות לסכם" body="הוצאות שתוסיפו יופיעו כאן לפי קטגוריות." />
      ) : (
        <>
          <Card testID="summary-total">
            <AppText variant="label" color={colors.inkMuted}>
              עלות הטיול הכוללת
            </AppText>
            <TotalText total={r.totalTripCost} variant="display" testID="summary-total-value" />
            <AppText variant="caption" color={colors.inkMuted}>
              כל ההוצאות של הטיול, כולל תשלומים מראש ואחרי החזרה{r.atmFees.count ? ' ועמלות כספומט' : ''}.
            </AppText>
          </Card>

          <View style={styles.grid}>
            <Stat label="במהלך הטיול" total={r.duringTrip} testID="summary-during" />
            <Stat label="היום" total={r.today} testID="summary-today" />
            {r.averagePerDay ? (
              <Card style={styles.stat} testID="summary-average">
                <AppText variant="label" color={colors.inkMuted}>
                  ממוצע ליום
                </AppText>
                <AppText variant="heading">{formatMoney(r.averagePerDay.amount)}</AppText>
                <AppText variant="caption" color={colors.inkMuted}>
                  {`${r.averagePerDay.days === 1 ? 'לפי יום טיול אחד' : `לפי ${r.averagePerDay.days} ימי טיול`}${r.averagePerDay.partial ? ' · חלקי (חסרים שערים)' : ''}`}
                </AppText>
              </Card>
            ) : null}
            {r.preTrip.count + r.preTrip.unavailableCount > 0 ? <Stat label="לפני הטיול" total={r.preTrip} testID="summary-pre" hint="למשל טיסות ולינה ששולמו מראש" /> : null}
            {r.postTrip.count + r.postTrip.unavailableCount > 0 ? <Stat label="אחרי הטיול" total={r.postTrip} testID="summary-post" /> : null}
          </View>

          <SectionTitle title="לפי קטגוריה" />
          <View style={styles.grid}>
            {r.byCategory.map(({ categoryId, total }) => {
              const c = data.categoryOf(categoryId);
              return (
                <Pressable
                  key={categoryId}
                  onPress={() => router.push(`/journal?category=${categoryId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c ? categoryLabel(c) : ''} ${formatMoney(total.amount)}`}
                  testID={`tile-${c?.builtinKey ?? categoryId}`}
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}>
                  <Row>
                    <Icon name={c ? categoryIcon(c.icon) : 'tag-outline'} color={colors.primary} size={20} />
                    <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {c ? categoryLabel(c) : '—'}
                    </AppText>
                  </Row>
                  <TotalText total={total} variant="heading" />
                </Pressable>
              );
            })}
            {r.atmFees.count + r.atmFees.unavailableCount > 0 ? (
              <View style={[styles.tile, styles.tileStatic]} testID="tile-atm-fees">
                <Row>
                  <Icon name="cash-plus" color={colors.atm} size={20} />
                  <AppText variant="label">עמלות כספומט</AppText>
                </Row>
                <TotalText total={r.atmFees} variant="heading" />
              </View>
            ) : null}
          </View>

          <SectionTitle title="מזומן מול אשראי" />
          <Card testID="summary-cash-card">
            {whole > 0 ? (
              <View style={styles.bar}>
                <View style={{ flex: cashPart, backgroundColor: colors.primary }} />
                <View style={{ flex: cardPart, backgroundColor: colors.card }} />
              </View>
            ) : null}
            <Row justify="space-between">
              <Row gap={6}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <AppText variant="label">{he.payment.CASH}</AppText>
              </Row>
              <TotalText total={r.cash} variant="heading" testID="summary-cash" />
            </Row>
            <Row justify="space-between">
              <Row gap={6}>
                <View style={[styles.dot, { backgroundColor: colors.card }]} />
                <AppText variant="label">{he.payment.CARD}</AppText>
              </Row>
              <TotalText total={r.card} variant="heading" testID="summary-card" />
            </Row>
            <AppText variant="caption" color={colors.inkMuted}>
              באשראי: לפי החיוב בפועל כשהוזן, אחרת לפי הערכה.
            </AppText>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: '45%' },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: space.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  tileStatic: { backgroundColor: colors.surfaceMuted },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
