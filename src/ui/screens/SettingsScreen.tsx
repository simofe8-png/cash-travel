import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { Card as CardModel } from '../../application/ports/CardRepository';
import { useApp, useQuery } from '../AppContext';
import { CurrencyPicker } from '../components/pickers';
import { AppText, Card, Divider, Icon, Screen, SectionTitle, type IconName } from '../components/primitives';
import { formatRange, ltr } from '../format';
import { he } from '../i18n/he';
import { colors, space, touch } from '../theme/tokens';
import { CardSheet, CategoriesSheet } from './SettingsSheets';

export function SettingsRow({ icon, title, subtitle, onPress, testID, trailing }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void; testID?: string; trailing?: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <AppText>{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.inkMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-right" directional size={20} color={colors.inkFaint} /> : null)}
    </Pressable>
  );
}

const FEE_LABEL = (c: string) => (c === 'NO_FOREIGN_FEE' ? 'ללא עמלת מט״ח' : c.startsWith('FEE_PERCENT:') ? `עמלה ${ltr(`${c.slice(12)}%`)}` : 'עמלה לא ידועה');

export function SettingsScreen() {
  const { services, notifyChanged } = useApp();
  const data = useQuery((s) => ({ trip: s.tripService.currentTrip(), cards: s.cardService.list() }));
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [cardSheet, setCardSheet] = useState<CardModel | 'new' | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [lockOn, setLockOn] = useState(() => services.appLockService.isEnabled());
  const trip = data.trip;
  if (!trip) return null;

  const toggleLock = async (want: boolean) => {
    if (want) {
      const r = await services.appLockService.enable();
      if (r === 'unavailable') Alert.alert('אין נעילת מסך במכשיר', 'כדי להשתמש בנעילה צריך קודם להגדיר במכשיר קוד, תבנית או טביעת אצבע.');
      setLockOn(r === 'enabled');
    } else {
      const ok = await services.appLockService.disable();
      setLockOn(!ok);
    }
  };

  const changeReporting = (code: string) => {
    services.tripService.updateTripDetails(trip.id, { name: trip.name, startDate: trip.startDate, endDate: trip.endDate, reportingCurrency: code });
    setCurrencyOpen(false);
    notifyChanged();
  };

  return (
    <Screen testID="screen-settings">
      <AppText variant="title">{he.tabs.settings}</AppText>

      <SectionTitle title="טיול" />
      <Card>
        <SettingsRow icon="airplane" title={trip.name} subtitle={`${formatRange(trip.startDate, trip.endDate)} · עריכת שם, תאריכים ומזומן פתיחה`} onPress={() => router.push(`/trip-setup?tripId=${trip.id}`)} testID="settings-edit-trip" />
        <Divider />
        <SettingsRow icon="swap-horizontal-circle-outline" title="מטבע לדיווח" subtitle="שינוי משפיע רק על התצוגה והסיכומים — לא על הפעולות עצמן" onPress={() => setCurrencyOpen(true)} testID="settings-reporting" trailing={<AppText variant="heading">{ltr(trip.reportingCurrency)}</AppText>} />
        <Divider />
        <SettingsRow icon="plus-circle-outline" title="טיול חדש" onPress={() => router.push('/trip-setup')} testID="settings-new-trip" />
      </Card>

      <SectionTitle title="כרטיסי אשראי" />
      <Card>
        {data.cards.length === 0 ? (
          <AppText variant="label" color={colors.inkMuted}>
            אין כרטיסים. אפשר לשלם ב״כרטיס אשראי״ גם בלי להגדיר, או להוסיף כרטיס כדי לקבל הערכת חיוב מדויקת יותר.
          </AppText>
        ) : (
          data.cards.map((c) => (
            <SettingsRow key={c.id} icon="credit-card-outline" title={c.nickname || he.issuers[c.issuer] || c.issuer} subtitle={`${he.issuers[c.issuer]} · ${FEE_LABEL(c.classification)} · חיוב ב-${ltr(c.billingCurrency)}`} onPress={() => setCardSheet(c)} testID={`settings-card-${c.id}`} />
          ))
        )}
        <Divider />
        <SettingsRow icon="plus" title="הוספת כרטיס" subtitle="רק חברת האשראי — בלי מספר כרטיס" onPress={() => setCardSheet('new')} testID="settings-add-card" />
      </Card>

      <SectionTitle title="הוצאות" />
      <Card>
        <SettingsRow icon="shape-outline" title="קטגוריות" subtitle="הוספה, שינוי שם ומחיקה של קטגוריות אישיות" onPress={() => setCategoriesOpen(true)} testID="settings-categories" />
      </Card>

      <SectionTitle title="פרטיות" />
      <Card>
        <SettingsRow
          icon="fingerprint"
          title="נעילת אפליקציה"
          subtitle="פתיחה בטביעת אצבע או בנעילת המסך של המכשיר"
          testID="settings-lock"
          trailing={<Switch value={lockOn} onValueChange={toggleLock} testID="settings-lock-switch" accessibilityLabel="נעילת אפליקציה" trackColor={{ true: colors.primary }} />}
        />
        <Divider />
        <SettingsRow icon="shield-lock-outline" title="הנתונים נשמרים רק במכשיר" subtitle="אין חשבון ואין גיבוי לענן. שערי מטבע נטענים מהרשת בלי לשלוח את הנתונים שלך." />
      </Card>

      <CurrencyPicker visible={currencyOpen} title="מטבע לדיווח" selected={trip.reportingCurrency} suggested={['ILS', 'USD', 'EUR']} onClose={() => setCurrencyOpen(false)} onSelect={changeReporting} />
      {cardSheet ? <CardSheet card={cardSheet === 'new' ? null : cardSheet} onClose={() => setCardSheet(null)} /> : null}
      {categoriesOpen ? <CategoriesSheet onClose={() => setCategoriesOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch, paddingVertical: space.xs },
});
