import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { Card as CardModel } from '../../application/ports/CardRepository';
import { useApp, useQuery } from '../AppContext';
import { Flag } from '../components/Flag';
import { PhotoHeader } from '../components/PhotoHeader';
import { CurrencyPicker } from '../components/pickers';
import { AppText, Button, Card, Icon, Screen, SectionTitle, type IconName } from '../components/primitives';
import { formatRange, ltr } from '../format';
import { useReportExport } from '../hooks';
import { he } from '../i18n/he';
import { colors, radius, space, touch } from '../theme/tokens';
import { CardSheet, CategoriesSheet } from './SettingsSheets';

const PHOTO = require('../../../assets/images/travel-header.jpg');

function SettingsRow({ icon, title, subtitle, onPress, testID, trailing, value, last }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; testID?: string; trailing?: ReactNode; value?: string; last?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID} style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { opacity: 0.7 }]}>
      {icon ? <Icon name={icon} color={colors.inkMuted} /> : null}
      <View style={styles.flex}>
        <AppText style={styles.rowTitle}>{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.inkMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="label" color={colors.inkMuted} numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing ?? (onPress ? <Icon name="chevron-left" size={20} color={colors.inkFaint} /> : null)}
    </Pressable>
  );
}

const FEE_LABEL = (c: string) => (c === 'NO_FOREIGN_FEE' ? 'ללא עמלת מט״ח' : c.startsWith('FEE_PERCENT:') ? `עמלה ${ltr(`${c.slice(12)}%`)}` : 'עמלה לא ידועה');

const ISSUER_COLOR: Record<string, string> = { ISRACARD: '#1E5BB8', MAX: '#E4007C', CAL: '#00A3E0', OTHER: '#5D6780' };

export function SettingsScreen() {
  const { services, notifyChanged } = useApp();
  const data = useQuery((s) => ({ trip: s.tripService.currentTrip(), cards: s.cardService.list() }));
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [cardSheet, setCardSheet] = useState<CardModel | 'new' | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [lockOn, setLockOn] = useState(() => services.appLockService.isEnabled());
  const { exporting, exportReport } = useReportExport(data.trip?.id ?? null);
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
  const editTrip = () => router.push(`/trip-setup?tripId=${trip.id}`);

  return (
    <Screen testID="screen-settings" header={<PhotoHeader compact title={he.tabs.settings} subtitle="ניהול פרטי הטיול והאפליקציה" />}>
      <Card>
        <SectionTitle title="פרטי הטיול" icon="airplane" />
        <View style={styles.tripRow}>
          <View style={styles.flex}>
            <AppText variant="heading" numberOfLines={2}>
              {trip.name}
            </AppText>
            <AppText variant="label" color={colors.inkMuted}>
              {formatRange(trip.startDate, trip.endDate)}
            </AppText>
          </View>
          <Image source={PHOTO} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
        </View>
        <SettingsRow
          title="מטבע לדיווח"
          onPress={() => setCurrencyOpen(true)}
          testID="settings-reporting"
          last
          trailing={
            <View style={styles.inline}>
              <Flag currency={trip.reportingCurrency} size={18} />
              <AppText variant="heading">{ltr(trip.reportingCurrency)}</AppText>
              <Icon name="chevron-left" size={20} color={colors.inkFaint} />
            </View>
          }
        />
        <Button compact label="עריכת פרטי טיול" icon="pencil" onPress={editTrip} testID="settings-edit-trip" />
        <AppText variant="caption" color={colors.inkMuted}>
          מטבע הדיווח משפיע רק על התצוגה והסיכומים — לא על הפעולות עצמן.
        </AppText>
      </Card>

      <Card>
        <SectionTitle
          title="כרטיסי אשראי"
          icon="credit-card-outline"
          action={
            <Pressable onPress={() => setCardSheet('new')} accessibilityRole="button" accessibilityLabel="הוספת כרטיס" testID="settings-add-card" style={({ pressed }) => [styles.addCard, pressed && { opacity: 0.8 }]}>
              <Icon name="plus" color={colors.primaryInk} size={18} />
              <AppText variant="label" color={colors.primaryInk}>
                הוסף כרטיס
              </AppText>
            </Pressable>
          }
        />
        {data.cards.length === 0 ? (
          <AppText variant="label" color={colors.inkMuted}>
            אין כרטיסים. אפשר לשלם ב״כרטיס אשראי״ גם בלי להגדיר, או להוסיף כרטיס (רק חברת האשראי — בלי מספר כרטיס) כדי לקבל הערכת חיוב מדויקת יותר.
          </AppText>
        ) : (
          data.cards.map((c) => (
            <Pressable key={c.id} onPress={() => setCardSheet(c)} accessibilityRole="button" accessibilityLabel={c.nickname || he.issuers[c.issuer] || c.issuer} testID={`settings-card-${c.id}`} style={({ pressed }) => [styles.cardRow, pressed && { opacity: 0.7 }]}>
              <View style={[styles.issuer, { backgroundColor: ISSUER_COLOR[c.issuer] ?? ISSUER_COLOR.OTHER }]}>
                <Icon name="credit-card-outline" color="#fff" size={26} />
              </View>
              <View style={styles.flex}>
                <AppText style={styles.rowTitle}>{c.nickname || he.issuers[c.issuer] || c.issuer}</AppText>
                <AppText variant="caption" color={colors.inkMuted}>
                  {FEE_LABEL(c.classification)}
                </AppText>
              </View>
              <View style={styles.billing}>
                <AppText variant="caption" color={colors.inkMuted}>
                  מטבע חיוב
                </AppText>
                <View style={styles.inline}>
                  <Flag currency={c.billingCurrency} size={16} />
                  <AppText variant="label">{ltr(c.billingCurrency)}</AppText>
                </View>
              </View>
              <Icon name="chevron-left" size={20} color={colors.inkFaint} />
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle title="הגדרות אפליקציה" icon="cog-outline" />
        <SettingsRow icon="shape-outline" title="קטגוריות" subtitle="הוספה, שינוי שם ומחיקה של קטגוריות אישיות" onPress={() => setCategoriesOpen(true)} testID="settings-categories" />
        <SettingsRow
          icon="lock-outline"
          title="נעילת אפליקציה"
          subtitle="טביעת אצבע או נעילת המסך של המכשיר"
          testID="settings-lock"
          trailing={<Switch value={lockOn} onValueChange={toggleLock} testID="settings-lock-switch" accessibilityLabel="נעילת אפליקציה" trackColor={{ true: colors.primary }} />}
        />
        <SettingsRow
          icon="file-download-outline"
          title={exporting ? 'מכין דוח…' : 'ייצוא דוח טיול (PDF)'}
          subtitle="שמירה ב-Drive או בקבצים, או שליחה בוואטסאפ ובמייל. דוח לסיכום — לא גיבוי."
          onPress={exporting ? undefined : exportReport}
          testID="settings-export"
        />
        <SettingsRow icon="plus-circle-outline" title="טיול חדש" onPress={() => router.push('/trip-setup')} testID="settings-new-trip" last />
      </Card>

      <Card>
        <SectionTitle title="אודות" icon="information-outline" />
        <SettingsRow icon="shield-lock-outline" title="הנתונים נשמרים רק במכשיר" subtitle="אין חשבון ואין גיבוי לענן. שערי מטבע נטענים מהרשת בלי לשלוח את הנתונים שלך." />
        <SettingsRow icon="tag-outline" title="גרסה" value={ltr(Constants.expoConfig?.version ?? '1.0.0')} last />
      </Card>

      <CurrencyPicker visible={currencyOpen} title="מטבע לדיווח" selected={trip.reportingCurrency} suggested={['ILS', 'USD', 'EUR']} onClose={() => setCurrencyOpen(false)} onSelect={changeReporting} />
      {cardSheet ? <CardSheet card={cardSheet === 'new' ? null : cardSheet} onClose={() => setCardSheet(null)} /> : null}
      {categoriesOpen ? <CategoriesSheet onClose={() => setCategoriesOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { fontWeight: '600' },
  value: { flexShrink: 1, maxWidth: '55%' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  photo: { width: 120, height: 80, borderRadius: radius.md },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  issuer: { width: 56, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  billing: { alignItems: 'flex-end' },
});
