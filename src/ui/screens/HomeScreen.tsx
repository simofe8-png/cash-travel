import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Total } from '../../domain/reporting';
import { tripDayCount, tripDayNumber } from '../../domain/trip';
import { daysBetween } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { ActionRow } from '../components/ActionRow';
import { Flag } from '../components/Flag';
import { HeaderButton, PhotoHeader } from '../components/PhotoHeader';
import { AppText, Button, Card, EmptyState, Icon, LinkText, MoneyText, Row, Screen, SectionTitle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { formatMoney, formatRange } from '../format';
import { useRateRefresh } from '../hooks';
import { colors, radius, space } from '../theme/tokens';

/** "₪52" or "₪52 + ฿100 ללא שער" — never hides unconverted items. */
export function TotalText({ total, variant = 'title', color = colors.ink, testID, hideEstimated }: { total: Total; variant?: 'title' | 'heading' | 'display'; color?: string; testID?: string; hideEstimated?: boolean }) {
  return (
    <View testID={testID}>
      <AppText variant={variant} color={color}>
        {formatMoney(total.amount)}
      </AppText>
      {total.unavailableCount > 0 ? (
        <AppText variant="caption" color={colors.warning}>
          {`+ ${total.unavailable.map((m) => formatMoney(m)).join(' + ')} ללא שער עדיין`}
        </AppText>
      ) : total.estimatedCount > 0 && !hideEstimated ? (
        <AppText variant="caption" color={colors.inkMuted}>
          כולל הערכות
        </AppText>
      ) : null}
    </View>
  );
}

function tripDayLine(start: string, end: string, today: string): string {
  const n = tripDayNumber({ startDate: start, endDate: end }, today);
  if (n !== null) return `יום ${n} מתוך ${tripDayCount({ startDate: start, endDate: end })}`;
  if (today < start) {
    const d = daysBetween(today, start);
    return d === 1 ? 'הטיול מתחיל מחר' : `הטיול מתחיל בעוד ${d} ימים`;
  }
  return 'הטיול הסתיים';
}

export function HomeScreen() {
  const { services, notifyChanged } = useApp();
  const [tripsOpen, setTripsOpen] = useState(false);
  const data = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    if (!trip) return null;
    return {
      trip,
      today: s.reportingService.today(),
      wallets: s.reportingService.wallets(trip.id),
      spending: s.reportingService.spending(trip.id),
      recent: s.journalService.recent(trip.id, 5),
      categories: new Map(s.categoryService.list().map((c) => [c.id, c])),
      needs: s.reportingService.rateNeeds(trip.id),
      trips: s.tripService.listTrips(),
    };
  });
  useRateRefresh(data?.needs ?? [], data?.trip.reportingCurrency ?? null);
  if (!data) return null;
  const { trip, today, wallets, spending } = data;
  const negative = wallets.filter((w) => w.negative);

  return (
    <Screen
      testID="screen-home"
      header={
        <PhotoHeader
          title={trip.name}
          subtitle={tripDayLine(trip.startDate, trip.endDate, today)}
          caption={formatRange(trip.startDate, trip.endDate)}
          onTitlePress={() => setTripsOpen(true)}
          titleTestID="home-trip"
          start={<HeaderButton icon="swap-horizontal" label="החלפת טיול" onPress={() => setTripsOpen(true)} testID="home-switch" />}
          end={<HeaderButton icon="cog-outline" label="הגדרות" onPress={() => router.push('/settings')} testID="home-settings" />}
        />
      }>
      <Card testID="home-money">
        <SectionTitle title="הכסף שלי" icon="wallet-outline" />
        {wallets.length === 0 ? (
          <AppText color={colors.inkMuted}>אין מזומן רשום בטיול הזה. הוספת יתרת פתיחה נעשית בעריכת הטיול.</AppText>
        ) : (
          <View style={styles.wallets}>
            {wallets.map((w) => (
              <View key={w.currency} style={[styles.wallet, w.negative && styles.walletNegative]} testID={`wallet-${w.currency}`}>
                <View style={styles.walletTop}>
                  <Row gap={6}>
                    <Flag currency={w.currency} />
                    <AppText variant="label">{w.currency}</AppText>
                  </Row>
                  <MoneyText value={w.current} variant="title" color={w.current.minor > 0 ? colors.success : colors.ink} testID={`wallet-current-${w.currency}`} />
                </View>
                <View style={styles.walletBottom}>
                  <AppText variant="caption" color={colors.inkMuted}>
                    התחלה
                  </AppText>
                  <AppText variant="label">{formatMoney(w.opening)}</AppText>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.spend}>
          <Pressable onPress={() => router.push('/summary')} accessibilityRole="button" accessibilityLabel="עלות הטיול עד כה, לסיכום" style={({ pressed }) => [styles.spendHalf, styles.spendTrip, pressed && { opacity: 0.7 }]} testID="home-trip-total">
            <Row gap={6}>
              <Icon name="chart-bar" color={colors.danger} size={20} />
              <AppText variant="label" color={colors.danger} style={styles.flex} numberOfLines={1}>
                עלות הטיול
              </AppText>
            </Row>
            <TotalText total={spending.totalTripCost} variant="heading" color={colors.danger} testID="home-trip-total-value" />
          </Pressable>
          <View style={[styles.spendHalf, styles.spendToday]} testID="home-today">
            <Row gap={6}>
              <Icon name="calendar-today" color={colors.primary} size={20} />
              <AppText variant="label" color={colors.inkMuted} numberOfLines={1}>
                הוצאות היום
              </AppText>
            </Row>
            <TotalText total={spending.today} variant="heading" testID="home-today-total" />
          </View>
        </View>
      </Card>

      {negative.map((w) => (
        <View key={w.currency} style={styles.negative} testID={`negative-${w.currency}`} accessibilityRole="alert">
          <Row align="flex-start">
            <Icon name="alert-circle-outline" color={colors.danger} />
            <View style={styles.flex}>
              <AppText variant="heading" color={colors.danger}>{`היתרה ב-${w.currency} שלילית`}</AppText>
              <AppText variant="label">כנראה חסרה פעולה: המרה, משיכה או יתרת פתיחה. אפשר להוסיף אותה או לתקן לפי מה שבארנק.</AppText>
            </View>
          </Row>
          <Row wrap>
            <Button compact tone="secondary" label="המרת מט״ח" icon="swap-horizontal" onPress={() => router.push(`/add?mode=FX_EXCHANGE&currency=${w.currency}`)} />
            <Button compact tone="secondary" label="משיכה" icon="cash-plus" onPress={() => router.push(`/add?mode=ATM_WITHDRAWAL&currency=${w.currency}`)} />
            <Button compact tone="secondary" label="תיקון יתרה" icon="scale-balance" onPress={() => router.push(`/add?mode=CASH_ADJUSTMENT&currency=${w.currency}`)} />
          </Row>
        </View>
      ))}

      <Card>
        <SectionTitle title="תנועות אחרונות" icon="clock-outline" action={data.recent.length ? <LinkText label="הצג הכל" onPress={() => router.push('/journal')} testID="home-all" /> : undefined} />
        {data.recent.length === 0 ? (
          <EmptyState icon="notebook-outline" title="עוד לא נרשמו פעולות" body="לחצו על + כדי לרשום הוצאה, המרה או משיכה." />
        ) : (
          data.recent.map((r, i) => <ActionRow key={r.id} row={r} categories={data.categories} today={today} last={i === data.recent.length - 1} />)
        )}
      </Card>

      <Button label="הוספת פעולה" icon="plus" onPress={() => router.push('/add')} testID="home-add" />

      <Sheet visible={tripsOpen} title="הטיולים שלי" onClose={() => setTripsOpen(false)} testID="trip-switcher">
        {data.trips.map((t) => (
          <Pressable
            key={t.id}
            testID={`switch-trip-${t.id}`}
            accessibilityRole="button"
            onPress={() => {
              services.tripService.selectTrip(t.id);
              setTripsOpen(false);
              notifyChanged();
            }}
            style={[styles.tripOption, t.id === trip.id && styles.tripSelected]}>
            <AppText variant="heading">{t.name}</AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {`${formatRange(t.startDate, t.endDate)} · ${t.status === 'CURRENT' ? 'עכשיו' : t.status === 'UPCOMING' ? 'עתידי' : 'הסתיים'}`}
            </AppText>
          </Pressable>
        ))}
        <Button
          label="טיול חדש"
          icon="plus"
          tone="soft"
          testID="new-trip"
          onPress={() => {
            setTripsOpen(false);
            router.push('/trip-setup');
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wallets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  wallet: { flexGrow: 1, flexBasis: '30%', minWidth: 100, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface },
  walletNegative: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  walletTop: { padding: space.md, gap: 2 },
  walletBottom: { paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surfaceMuted, gap: 0 },
  spend: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  spendHalf: { flex: 1, gap: 4, padding: space.md, borderRadius: radius.md },
  spendTrip: { backgroundColor: colors.dangerSoft },
  spendToday: { backgroundColor: colors.primarySoft },
  negative: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: '#F7C6CC' },
  tripOption: { padding: space.md, borderRadius: radius.sm, gap: 2, backgroundColor: colors.surface },
  tripSelected: { borderWidth: 1, borderColor: colors.primary },
});
