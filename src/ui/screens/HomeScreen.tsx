import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Total } from '../../domain/reporting';
import { tripDayCount, tripDayNumber } from '../../domain/trip';
import { daysBetween } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { ActionRow } from '../components/ActionRow';
import { AppText, Banner, Button, Card, EmptyState, Icon, MoneyText, Row, Screen, SectionTitle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { formatDayHeader, formatMoney, formatRange } from '../format';
import { useRateRefresh } from '../hooks';
import { colors, radius, space } from '../theme/tokens';

/** "₪52.00" or "₪52.00 + 1 ללא שער" — never hides unconverted items. */
export function TotalText({ total, variant = 'title', testID }: { total: Total; variant?: 'title' | 'heading' | 'display'; testID?: string }) {
  return (
    <View testID={testID}>
      <AppText variant={variant}>{formatMoney(total.amount)}</AppText>
      {total.unavailableCount > 0 ? (
        <AppText variant="caption" color={colors.warning}>
          {`+ ${total.unavailable.map((m) => formatMoney(m)).join(' + ')} ללא שער עדיין`}
        </AppText>
      ) : total.estimatedCount > 0 ? (
        <AppText variant="caption" color={colors.inkMuted}>
          כולל ערכים משוערים
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
    <Screen testID="screen-home">
      <Pressable onPress={() => setTripsOpen(true)} accessibilityRole="button" accessibilityLabel={`טיול נוכחי: ${trip.name}. החלפת טיול`} testID="home-trip">
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>
              {trip.name}
            </AppText>
            <AppText variant="label" color={colors.inkMuted}>
              {`${formatDayHeader(today)} · ${tripDayLine(trip.startDate, trip.endDate, today)}`}
            </AppText>
          </View>
          <Icon name="chevron-down" color={colors.inkMuted} />
        </Row>
      </Pressable>

      {negative.map((w) => (
        <Banner
          key={w.currency}
          tone="danger"
          testID={`negative-${w.currency}`}
          title={`היתרה ב-${w.currency} שלילית`}
          body="כנראה חסרה פעולה: המרה, משיכה מכספומט, או יתרה התחלתית. אפשר להוסיף אותה עכשיו או לתקן את היתרה לפי מה שבארנק.">
          <Row wrap>
            <Button compact tone="secondary" label="המרת מט״ח" icon="swap-horizontal" onPress={() => router.push(`/add?mode=FX_EXCHANGE&currency=${w.currency}`)} />
            <Button compact tone="secondary" label="משיכה" icon="cash-plus" onPress={() => router.push(`/add?mode=ATM_WITHDRAWAL&currency=${w.currency}`)} />
            <Button compact tone="secondary" label="תיקון יתרה" icon="scale-balance" onPress={() => router.push(`/add?mode=CASH_ADJUSTMENT&currency=${w.currency}`)} />
          </Row>
        </Banner>
      ))}

      <SectionTitle title="מזומן בארנק" />
      {wallets.length === 0 ? (
        <Card>
          <AppText color={colors.inkMuted}>אין מזומן רשום בטיול הזה. הוספת יתרת פתיחה נעשית בהגדרות הטיול.</AppText>
        </Card>
      ) : (
        <View style={styles.wallets}>
          {wallets.map((w) => (
            <Card key={w.currency} style={[styles.wallet, w.negative && styles.walletNegative]} testID={`wallet-${w.currency}`}>
              <AppText variant="label" color={colors.inkMuted}>
                {w.currency}
              </AppText>
              <MoneyText value={w.current} variant="title" testID={`wallet-current-${w.currency}`} />
              <AppText variant="caption" color={colors.inkMuted}>
                {`פתיחה ${formatMoney(w.opening)}`}
              </AppText>
              {w.currentInReporting && w.current.currency !== trip.reportingCurrency ? (
                <AppText variant="caption" color={colors.inkMuted}>{`≈ ${formatMoney(w.currentInReporting)}`}</AppText>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <View style={styles.totals}>
        <Card style={styles.totalCard} testID="home-today">
          <AppText variant="label" color={colors.inkMuted}>
            הוצאות היום
          </AppText>
          <TotalText total={spending.today} variant="heading" testID="home-today-total" />
        </Card>
        <Card style={styles.totalCard} testID="home-trip-total">
          <AppText variant="label" color={colors.inkMuted}>
            עד עכשיו בטיול
          </AppText>
          <TotalText total={spending.totalTripCost} variant="heading" testID="home-trip-total-value" />
        </Card>
      </View>

      <SectionTitle
        title="פעולות אחרונות"
        action={
          data.recent.length ? (
            <Pressable onPress={() => router.push('/journal')} accessibilityRole="button" hitSlop={10}>
              <AppText variant="label" color={colors.primary}>
                הכול
              </AppText>
            </Pressable>
          ) : undefined
        }
      />
      {data.recent.length === 0 ? (
        <EmptyState icon="notebook-outline" title="עוד לא נרשמו פעולות" body="לחצו על + כדי לרשום הוצאה, המרה או משיכה." />
      ) : (
        <Card>
          {data.recent.map((r) => (
            <ActionRow key={r.id} row={r} categories={data.categories} />
          ))}
        </Card>
      )}

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
          tone="secondary"
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
  wallets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  wallet: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  walletNegative: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  totals: { flexDirection: 'row', gap: space.md },
  totalCard: { flex: 1 },
  tripOption: { padding: space.md, borderRadius: radius.sm, gap: 2, backgroundColor: colors.surface },
  tripSelected: { borderWidth: 1, borderColor: colors.primary },
});
