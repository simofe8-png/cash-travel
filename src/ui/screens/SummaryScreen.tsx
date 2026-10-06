import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Total } from '../../domain/reporting';
import { tripDayCount, tripDayNumber } from '../../domain/trip';
import { useQuery } from '../AppContext';
import { Flag } from '../components/Flag';
import { PhotoHeader } from '../components/PhotoHeader';
import { AppText, Button, Card, EmptyState, Icon, MoneyText, Row, Screen, SectionTitle } from '../components/primitives';
import { formatDateNumeric, formatMoney, formatRange } from '../format';
import { useRateRefresh, useReportExport } from '../hooks';
import { categoryLabel, he } from '../i18n/he';
import { categoryColor, categoryIcon } from '../present';
import { colors, radius, space } from '../theme/tokens';
import { TotalText } from './HomeScreen';

/** Presentation-only share of a total (bars/percent labels); no financial value is derived from it. */
function share(part: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0;
}

function Stat({ label, total, testID, hint }: { label: string; total: Total; testID: string; hint?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <AppText variant="caption" color={colors.inkMuted}>
        {label}
      </AppText>
      <TotalText total={total} variant="heading" testID={`${testID}-value`} />
      {hint ? (
        <AppText variant="caption" color={colors.inkMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function SummaryScreen() {
  const data = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    if (!trip) return null;
    return {
      trip,
      today: s.reportingService.today(),
      spending: s.reportingService.spending(trip.id),
      wallets: s.reportingService.wallets(trip.id),
      categoryOf: (id: number) => s.categoryService.get(id),
      needs: s.reportingService.rateNeeds(trip.id),
    };
  });
  useRateRefresh(data?.needs ?? [], data?.trip.reportingCurrency ?? null);
  const { exporting, exportReport } = useReportExport(data?.trip.id ?? null);
  if (!data) return null;
  const { trip, spending: r } = data;
  const empty = r.totalTripCost.count + r.totalTripCost.unavailableCount === 0;
  const dayNumber = tripDayNumber(trip, data.today);
  const days = tripDayCount(trip);
  const totalMinor = Math.max(r.totalTripCost.amount.minor, 0);
  const cashPart = Math.max(r.cash.amount.minor, 0);
  const cardPart = Math.max(r.card.amount.minor, 0);
  const pct = (x: number) => `${Math.round(share(x, totalMinor) * 100)}%`;

  return (
    <Screen testID="screen-summary" header={<PhotoHeader title="סיכום הטיול" subtitle={trip.name} caption={formatRange(trip.startDate, trip.endDate)} />}>
      <View style={styles.metrics}>
        <View style={[styles.metric, styles.metricTotal]} testID="summary-total">
          <Row gap={6}>
            <Icon name="chart-bar" color={colors.danger} size={22} />
            <AppText variant="label" color={colors.danger}>
              סה״כ הוצאות
            </AppText>
          </Row>
          <TotalText total={r.totalTripCost} variant="title" color={colors.danger} testID="summary-total-value" />
        </View>
        <View style={[styles.metric, styles.metricDays]} testID="summary-days">
          <Row gap={6}>
            <Icon name="calendar-month-outline" color={colors.primary} size={22} />
            <AppText variant="label" color={colors.primary}>
              ימי טיול
            </AppText>
          </Row>
          <AppText variant="title" color={colors.primary}>{dayNumber !== null ? `${dayNumber} / ${days}` : `${days}`}</AppText>
          <AppText variant="caption" color={colors.inkMuted}>{`התחלה ${formatDateNumeric(trip.startDate)}`}</AppText>
          <AppText variant="caption" color={colors.inkMuted}>{`סיום ${formatDateNumeric(trip.endDate)}`}</AppText>
        </View>
      </View>

      {empty ? (
        <EmptyState icon="chart-bar" title="עוד אין הוצאות לסכם" body="הוצאות שתוסיפו יופיעו כאן לפי קטגוריות." />
      ) : (
        <>
          <Card>
            <View style={styles.stats}>
              <Stat label="היום" total={r.today} testID="summary-today" />
              {r.averagePerDay ? (
                <View style={styles.stat} testID="summary-average">
                  <AppText variant="caption" color={colors.inkMuted}>
                    ממוצע יומי
                  </AppText>
                  <AppText variant="heading">{formatMoney(r.averagePerDay.amount)}</AppText>
                  <AppText variant="caption" color={colors.inkMuted}>
                    {`${r.averagePerDay.days === 1 ? 'לפי יום טיול אחד' : `לפי ${r.averagePerDay.days} ימי טיול`}${r.averagePerDay.partial ? ' · חלקי' : ''}`}
                  </AppText>
                </View>
              ) : null}
              <Stat label="במהלך הטיול" total={r.duringTrip} testID="summary-during" />
              {r.preTrip.count + r.preTrip.unavailableCount > 0 ? <Stat label="לפני הטיול" total={r.preTrip} testID="summary-pre" hint="למשל טיסות ולינה מראש" /> : null}
              {r.postTrip.count + r.postTrip.unavailableCount > 0 ? <Stat label="אחרי הטיול" total={r.postTrip} testID="summary-post" /> : null}
            </View>
          </Card>

          <Card>
            <SectionTitle title="הוצאות לפי קטגוריה" icon="shape-outline" />
            {r.byCategory.map(({ categoryId, total }) => {
              const c = data.categoryOf(categoryId);
              const color = c ? categoryColor(c.icon) : colors.primary;
              const part = share(Math.max(total.amount.minor, 0), totalMinor);
              return (
                <Pressable
                  key={categoryId}
                  onPress={() => router.push(`/journal?category=${categoryId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c ? categoryLabel(c) : ''} ${formatMoney(total.amount)}`}
                  testID={`tile-${c?.builtinKey ?? categoryId}`}
                  style={({ pressed }) => [styles.catRow, pressed && { opacity: 0.7 }]}>
                  <Row>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <Icon name={c ? categoryIcon(c.icon) : 'tag-outline'} color={color} size={20} />
                    <AppText variant="label" numberOfLines={1} style={styles.flex}>
                      {c ? categoryLabel(c) : '—'}
                    </AppText>
                    <TotalText total={total} variant="heading" hideEstimated />
                  </Row>
                  <Row>
                    <View style={[styles.track, styles.flex]}>
                      <View style={{ width: `${part * 100}%`, backgroundColor: color, borderRadius: 4 }} />
                    </View>
                    <AppText variant="caption" color={colors.inkMuted} style={styles.pct}>
                      {pct(Math.max(total.amount.minor, 0))}
                    </AppText>
                  </Row>
                </Pressable>
              );
            })}
            {r.atmFees.count + r.atmFees.unavailableCount > 0 ? (
              <View style={styles.catRow} testID="tile-atm-fees">
                <Row>
                  <View style={[styles.dot, { backgroundColor: colors.atm }]} />
                  <Icon name="cash-plus" color={colors.atm} size={20} />
                  <AppText variant="label" style={styles.flex}>
                    עמלות כספומט
                  </AppText>
                  <TotalText total={r.atmFees} variant="heading" hideEstimated />
                </Row>
              </View>
            ) : null}
          </Card>

          <Card testID="summary-cash-card">
            <SectionTitle title="הוצאות לפי אמצעי תשלום" icon="credit-card-outline" />
            {cashPart + cardPart > 0 ? (
              <View style={styles.bar}>
                <View style={{ flex: cashPart, backgroundColor: colors.success }} />
                <View style={{ flex: cardPart, backgroundColor: colors.primary }} />
              </View>
            ) : null}
            <Row justify="space-between">
              <Row gap={6}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <AppText variant="label">{he.payment.CASH}</AppText>
                <AppText variant="caption" color={colors.inkMuted}>
                  {pct(cashPart)}
                </AppText>
              </Row>
              <TotalText total={r.cash} variant="heading" testID="summary-cash" />
            </Row>
            <Row justify="space-between">
              <Row gap={6}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <AppText variant="label">כרטיס אשראי</AppText>
                <AppText variant="caption" color={colors.inkMuted}>
                  {pct(cardPart)}
                </AppText>
              </Row>
              <TotalText total={r.card} variant="heading" testID="summary-card" />
            </Row>
            <AppText variant="caption" color={colors.inkMuted}>
              באשראי: לפי החיוב בפועל כשהוזן, אחרת לפי הערכה.
            </AppText>
          </Card>
        </>
      )}

      {data.wallets.length ? (
        <Card testID="summary-wallets">
          <SectionTitle title="מזומן לפי מטבעות" icon="wallet-outline" />
          <View style={styles.wallets}>
            {data.wallets.map((w) => (
              <View key={w.currency} style={[styles.wallet, w.negative && styles.walletNegative]}>
                <Row gap={6}>
                  <Flag currency={w.currency} size={18} />
                  <AppText variant="label">{w.currency}</AppText>
                </Row>
                <MoneyText value={w.current} variant="heading" color={w.current.minor > 0 ? colors.success : colors.ink} />
                <AppText variant="caption" color={colors.inkMuted}>{`התחלה: ${formatMoney(w.opening)}`}</AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Button label={exporting ? 'מכין דוח…' : 'הפק דוח PDF'} icon="file-download-outline" tone="soft" busy={exporting} onPress={exportReport} testID="summary-export" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  metrics: { flexDirection: 'row', gap: space.sm },
  metric: { flex: 1, borderRadius: radius.lg - 4, padding: space.md, gap: 2, borderWidth: 1 },
  metricTotal: { backgroundColor: colors.dangerSoft, borderColor: '#F7C6CC' },
  metricDays: { backgroundColor: colors.primarySoft, borderColor: '#C9D9FB' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, columnGap: space.sm },
  stat: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  catRow: { gap: 6, paddingVertical: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pct: { minWidth: 36, textAlign: 'left' },
  track: { flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  wallets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  wallet: { flexGrow: 1, flexBasis: '30%', minWidth: 100, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, gap: 2 },
  walletNegative: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
});
