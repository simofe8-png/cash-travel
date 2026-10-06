import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TripValidationError } from '../../application/trips/TripService';
import { currencyInfo, money, parseAmount, type Money } from '../../domain/money';
import { addDays } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { Flag } from '../components/Flag';
import { HeaderButton, PhotoHeader } from '../components/PhotoHeader';
import { AmountInput, CurrencyPicker, DateField } from '../components/pickers';
import { AppText, Banner, Button, Card, Field, Icon, Row, Screen } from '../components/primitives';
import { formatMoney, plainAmount } from '../format';
import { useRateRefresh } from '../hooks';
import { colors, radius, space } from '../theme/tokens';

interface OpeningRow {
  key: number;
  currency: string;
  text: string;
}

const TRIP_ERRORS: Record<string, string> = {
  NAME_REQUIRED: 'צריך לתת לטיול שם',
  NAME_TOO_LONG: 'השם ארוך מדי (עד 80 תווים)',
  INVALID_START: 'תאריך התחלה לא תקין',
  INVALID_END: 'תאריך סיום לא תקין',
  END_BEFORE_START: 'תאריך הסיום לפני תאריך ההתחלה',
  UNSUPPORTED_CURRENCY: 'מטבע לא נתמך',
  DUPLICATE_OPENING_CURRENCY: 'כל מטבע יכול להופיע פעם אחת',
  OPENING_NOT_POSITIVE: 'סכום פתיחה חייב להיות גדול מאפס',
};

const AMOUNT_ERRORS: Record<string, string> = {
  invalid: 'סכום לא תקין',
  too_many_decimals: 'יותר מדי ספרות אחרי הנקודה',
  negative_not_allowed: 'סכום חייב להיות חיובי',
  too_large: 'סכום גדול מדי',
};

let rowKey = 1;

export function TripSetupScreen() {
  const { services, notifyChanged } = useApp();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const editId = params.tripId ? Number(params.tripId) : null;
  const today = services.tripService.today();

  const initial = useQuery((s) => {
    if (editId === null) return null;
    const trip = s.tripService.getTrip(editId);
    return trip ? { trip, openings: s.tripService.openingBalances(editId) } : null;
  }, [editId]);

  const [name, setName] = useState(initial?.trip.name ?? '');
  const [start, setStart] = useState(initial?.trip.startDate ?? today);
  const [end, setEnd] = useState(initial?.trip.endDate ?? addDays(today, 7));
  const [reporting, setReporting] = useState(initial?.trip.reportingCurrency ?? 'ILS');
  const [rows, setRows] = useState<OpeningRow[]>(() =>
    (initial?.openings ?? []).map((m: Money) => ({ key: rowKey++, currency: m.currency, text: plainAmount(m) })),
  );
  const [picker, setPicker] = useState<{ kind: 'reporting' } | { kind: 'row'; key: number } | { kind: 'new' } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () =>
      rows.map((r) => {
        if (r.text.trim() === '') return { row: r, error: 'נא להזין סכום', amount: null };
        const p = parseAmount(r.text, r.currency);
        return p.ok ? { row: r, error: p.minor <= 0 ? 'סכום חייב להיות גדול מאפס' : null, amount: money(p.minor, r.currency) } : { row: r, error: AMOUNT_ERRORS[p.error] ?? 'סכום לא תקין', amount: null };
      }),
    [rows],
  );
  const validAmounts = parsed.filter((p) => p.amount && !p.error).map((p) => p.amount as Money);

  const equivalent = useQuery((s) => s.reportingService.approximateEquivalent(validAmounts, reporting, today), [validAmounts, reporting, today]);
  useRateRefresh(validAmounts.length ? [{ date: today, currencies: validAmounts.map((a) => a.currency) }] : [], reporting);

  const usedCurrencies = rows.map((r) => r.currency);

  function save() {
    const rowErrors = parsed.filter((p) => p.error);
    if (rowErrors.length) {
      setErrors([...new Set(rowErrors.map((p) => p.error as string))]);
      return;
    }
    const details = { name, startDate: start, endDate: end, reportingCurrency: reporting };
    setBusy(true);
    try {
      if (editId === null) {
        services.tripService.createTrip(details, validAmounts);
        notifyChanged();
        router.replace('/');
      } else {
        services.tripService.updateTrip(editId, details, validAmounts);
        notifyChanged();
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }
    } catch (e) {
      setErrors(e instanceof TripValidationError ? e.violations.map((v) => TRIP_ERRORS[v] ?? v) : ['השמירה נכשלה. לא נשמר דבר.']);
    } finally {
      setBusy(false);
    }
  }

  const canClose = editId !== null || services.tripService.listTrips().length > 0;

  return (
    <Screen
      testID="screen-tripsetup"
      header={
        <PhotoHeader
          title={editId === null ? 'טיול חדש' : 'עריכת טיול'}
          subtitle={editId === null ? 'ואנחנו מתחילים' : undefined}
          end={canClose ? <HeaderButton icon="close" label="סגירה" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="trip-close" /> : undefined}
        />
      }
      footer={<Button label={editId === null ? 'התחל טיול' : 'שמירת שינויים'} onPress={save} busy={busy} testID="trip-save" />}>
      {errors.length ? <Banner tone="danger" title="יש לתקן לפני שמירה" body={errors.join('\n')} testID="trip-errors" /> : null}

      <Card style={styles.form}>
        <Field label="שם הטיול" value={name} onChangeText={setName} placeholder="למשל: תאילנד 2026" maxLength={80} testID="trip-name" />
        <Row align="flex-start">
          <DateField
            label="תאריך התחלה"
            value={start}
            onChange={(d) => {
              setStart(d);
              if (end < d) setEnd(d);
            }}
            testID="trip-start"
          />
          <DateField label="תאריך סיום" value={end} min={start} onChange={setEnd} testID="trip-end" />
        </Row>
        <View style={{ gap: space.xs }}>
          <AppText variant="label" color={colors.inkMuted}>
            מטבע דיווח
          </AppText>
          <Pressable onPress={() => setPicker({ kind: 'reporting' })} accessibilityRole="button" accessibilityLabel={`מטבע דיווח ${reporting}`} testID="trip-reporting" style={({ pressed }) => [styles.select, pressed && { opacity: 0.7 }]}>
            <Flag currency={reporting} />
            <AppText style={styles.flex}>{`${currencyInfo(reporting).nameHe} (${reporting})`}</AppText>
            <Icon name="chevron-down" size={20} color={colors.inkMuted} />
          </Pressable>
          <AppText variant="caption" color={colors.inkMuted}>
            הסיכומים יוצגו במטבע הזה. אפשר לשנות בכל עת — הנתונים המקוריים לא משתנים.
          </AppText>
        </View>
      </Card>

      <Card style={styles.form}>
        <AppText variant="heading">יתרות התחלה (לא חובה)</AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          כמה מזומן יש לך בכל מטבע ברגע זה. זה לא תקציב — רק נקודת הפתיחה של הארנק.
        </AppText>
        {rows.map((r, i) => {
          const err = parsed[i]?.error;
          const info = currencyInfo(r.currency);
          return (
            <View key={r.key} style={{ gap: 4 }}>
              <View style={styles.opening}>
                <Pressable onPress={() => setPicker({ kind: 'row', key: r.key })} accessibilityRole="button" accessibilityLabel={`מטבע ${r.currency}`} testID={`opening-currency-${i}`} style={styles.openingCurrency}>
                  <Flag currency={r.currency} size={26} />
                  <View style={styles.shrink}>
                    <AppText style={styles.bold}>{r.currency}</AppText>
                    <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                      {info.nameHe}
                    </AppText>
                  </View>
                </Pressable>
                <View style={styles.amountBox}>
                  <AmountInput value={r.text} onChange={(t) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, text: t } : x)))} error={!!err && r.text !== ''} testID={`opening-amount-${i}`} />
                  <AppText variant="heading" color={colors.inkMuted}>
                    {info.symbol}
                  </AppText>
                </View>
                <Pressable onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} accessibilityRole="button" accessibilityLabel="הסרת מטבע" hitSlop={10} testID={`opening-remove-${i}`}>
                  <Icon name="trash-can-outline" color={colors.inkMuted} />
                </Pressable>
              </View>
              {err && r.text !== '' ? (
                <AppText variant="caption" color={colors.danger}>
                  {err}
                </AppText>
              ) : null}
            </View>
          );
        })}
        <Pressable onPress={() => setPicker({ kind: 'new' })} accessibilityRole="button" accessibilityLabel="הוספת מטבע" testID="opening-add" style={({ pressed }) => [styles.addCurrency, pressed && { opacity: 0.7 }]}>
          <Icon name="plus-circle" color={colors.primary} size={26} />
          <AppText variant="heading" color={colors.primary}>
            הוסף מטבע
          </AppText>
        </Pressable>
      </Card>

      {validAmounts.length ? (
        <View style={styles.info} testID="trip-equivalent">
          <Icon name="information-outline" color={colors.primary} />
          <View style={styles.flex}>
            <AppText variant="label" color={colors.inkMuted}>
              שווי משוער לפי שער ייחוס (לא מזומן בפועל)
            </AppText>
            <AppText variant="title">{`≈ ${formatMoney(equivalent.amount)}`}</AppText>
            {equivalent.unavailableCount ? (
              <AppText variant="caption" color={colors.warning}>
                {`אין עדיין שער עבור ${equivalent.unavailable.map((m) => formatMoney(m)).join(', ')} — יתעדכן כשיהיה חיבור לרשת.`}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      <CurrencyPicker
        visible={picker !== null}
        title={picker?.kind === 'reporting' ? 'מטבע דיווח' : 'מטבע'}
        selected={picker?.kind === 'reporting' ? reporting : picker?.kind === 'row' ? rows.find((r) => r.key === picker.key)?.currency : undefined}
        suggested={['ILS', 'USD', 'EUR', 'THB', 'GBP', 'JPY']}
        exclude={picker?.kind === 'new' ? usedCurrencies : picker?.kind === 'row' ? usedCurrencies.filter((c) => c !== rows.find((r) => r.key === picker.key)?.currency) : undefined}
        onClose={() => setPicker(null)}
        onSelect={(code) => {
          if (picker?.kind === 'reporting') setReporting(code);
          else if (picker?.kind === 'row') setRows((rs) => rs.map((x) => (x.key === picker.key ? { ...x, currency: code } : x)));
          else if (picker?.kind === 'new') setRows((rs) => [...rs, { key: rowKey++, currency: code, text: '' }]);
          setPicker(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  shrink: { flexShrink: 1 },
  form: { gap: space.md },
  select: { minHeight: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  opening: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  openingCurrency: { flexDirection: 'row', alignItems: 'center', gap: space.sm, width: '38%' },
  amountBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  addCurrency: { minHeight: 56, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9DBCF7', backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  info: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
