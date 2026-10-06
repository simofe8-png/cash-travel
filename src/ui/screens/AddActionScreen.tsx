import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ExpensePayment, TransactionType } from '../../domain/ledger';
import { exchangeRateView } from '../../domain/fx';
import { money, parseAmount, type Money } from '../../domain/money';
import { localTimeOf, occurrenceAtLocal } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { AmountInput, CurrencyButton, CurrencyPicker, DateField } from '../components/pickers';
import { AppText, Banner, Button, Card, Chip, Field, Icon, Row, Screen, SectionTitle } from '../components/primitives';
import { formatMoney, formatRate } from '../format';
import { categoryLabel, he } from '../i18n/he';
import { categoryIcon } from '../present';
import { colors, radius, space } from '../theme/tokens';

type Mode = Extract<TransactionType, 'EXPENSE' | 'FX_EXCHANGE' | 'ATM_WITHDRAWAL' | 'CASH_ADJUSTMENT'>;
const MODES: readonly Mode[] = ['EXPENSE', 'FX_EXCHANGE', 'ATM_WITHDRAWAL'];

const AMOUNT_ERRORS: Record<string, string> = {
  empty: 'נא להזין סכום',
  invalid: 'סכום לא תקין',
  too_many_decimals: 'יותר מדי ספרות אחרי הנקודה',
  negative_not_allowed: 'סכום חייב להיות חיובי',
  too_large: 'סכום גדול מדי',
};

/** Parses a positive amount; returns the Money or an error message. */
function readAmount(text: string, currency: string, allowZero = false): { value: Money | null; error: string | null } {
  const p = parseAmount(text, currency);
  if (!p.ok) return { value: null, error: AMOUNT_ERRORS[p.error] ?? 'סכום לא תקין' };
  if (p.minor === 0 && !allowZero) return { value: null, error: 'סכום חייב להיות גדול מאפס' };
  return { value: money(p.minor, currency), error: null };
}

function MoneyEntry(props: { label: string; text: string; onText: (t: string) => void; currency: string; onCurrency: () => void; id: string; big?: boolean; autoFocus?: boolean; error?: string | null }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label" color={colors.inkMuted}>
        {props.label}
      </AppText>
      <Row>
        <CurrencyButton code={props.currency} onPress={props.onCurrency} testID={`${props.id}-currency`} />
        <AmountInput value={props.text} onChange={props.onText} big={props.big} autoFocus={props.autoFocus} error={!!props.error} testID={`${props.id}-amount`} />
      </Row>
      {props.error ? (
        <AppText variant="caption" color={colors.danger}>
          {props.error}
        </AppText>
      ) : null}
    </View>
  );
}

function Collapsible({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: space.md }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={testID} style={styles.collapse}>
        <AppText variant="label" color={colors.primary}>
          {title}
        </AppText>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export function AddActionScreen() {
  const { services, notifyChanged } = useApp();
  const params = useLocalSearchParams<{ mode?: string; currency?: string }>();
  const ctx = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    if (!trip) return null;
    return {
      trip,
      defaults: s.expenseService.defaults(trip.id),
      categories: s.categoryService.list(),
      cards: s.cardService.list(),
      wallets: s.reportingService.wallets(trip.id),
    };
  });
  const initialMode = (['EXPENSE', 'FX_EXCHANGE', 'ATM_WITHDRAWAL', 'CASH_ADJUSTMENT'] as const).find((m) => m === params.mode) ?? 'EXPENSE';
  const [mode, setMode] = useState<Mode>(initialMode);
  const startCurrency = params.currency ?? ctx?.defaults.currency ?? 'ILS';

  // Shared
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState(startCurrency);
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [picker, setPicker] = useState<null | 'main' | 'other' | 'charged'>(null);
  // Expense
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [payment, setPayment] = useState<ExpensePayment>(ctx?.defaults.payment ?? { method: 'CASH' });
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [dcc, setDcc] = useState(false);
  const [chargedCurrency, setChargedCurrency] = useState('ILS');
  const [chargedText, setChargedText] = useState('');
  // When
  const now = services.tripService.nowOccurrence();
  const [date, setDate] = useState(now.occurredLocalDate);
  const [time, setTime] = useState(localTimeOf(now));
  const [whenTouched, setWhenTouched] = useState(false);
  // FX
  const [otherText, setOtherText] = useState('');
  const [otherCurrency, setOtherCurrency] = useState(ctx?.trip.reportingCurrency === startCurrency ? 'USD' : (ctx?.trip.reportingCurrency ?? 'ILS'));
  // ATM
  const [feeText, setFeeText] = useState('');
  const [atmCard, setAtmCard] = useState<number | null>(ctx?.defaults.payment.method === 'CARD' ? ctx.defaults.payment.cardId : null);

  const main = readAmount(amountText, currency);
  const other = readAmount(otherText, otherCurrency);
  const counted = readAmount(amountText, currency, true);
  const diff = useMemo(
    () => (ctx && mode === 'CASH_ADJUSTMENT' && counted.value ? services.reconciliationService.difference(ctx.trip.id, counted.value) : null),
    [ctx, mode, counted.value, services],
  );
  const rate = mode === 'FX_EXCHANGE' && main.value && other.value && main.value.currency !== other.value.currency ? exchangeRateView(main.value, other.value).display : null;
  const currentBalance = ctx?.wallets.find((w) => w.currency === currency)?.current ?? money(0, currency);

  if (!ctx) return null;
  const tripId = ctx.trip.id;

  function when() {
    if (!whenTouched) return undefined;
    return occurrenceAtLocal(date, /^\d{2}:\d{2}$/.test(time) ? time : '12:00', services.tripService.offsetMinutes());
  }

  function save() {
    setShowErrors(true);
    const errs: string[] = [];
    try {
      if (mode === 'EXPENSE') {
        if (main.error) errs.push(main.error);
        if (categoryId === null) errs.push('נא לבחור קטגוריה');
        let chargedIn = null;
        if (payment.method === 'CARD' && dcc) {
          const c = chargedText.trim() ? readAmount(chargedText, chargedCurrency) : { value: null, error: null };
          if (c.error) errs.push(`סכום החיוב: ${c.error}`);
          chargedIn = { currency: chargedCurrency, amountMinor: c.value?.minor ?? null };
        }
        if (errs.length) return setErrors(errs);
        services.expenseService.addExpense({ tripId, amount: main.value!, categoryId: categoryId!, payment, occurrence: when(), description, place, note, chargedIn });
      } else if (mode === 'FX_EXCHANGE') {
        if (main.error) errs.push(`נתתי: ${main.error}`);
        if (other.error) errs.push(`קיבלתי: ${other.error}`);
        if (currency === otherCurrency) errs.push('בהמרה צריך שני מטבעות שונים');
        if (errs.length) return setErrors(errs);
        services.fxService.exchange({ tripId, given: main.value!, received: other.value!, occurrence: when(), place, note });
      } else if (mode === 'ATM_WITHDRAWAL') {
        if (main.error) errs.push(main.error);
        const fee = feeText.trim() ? readAmount(feeText, currency, true) : { value: null, error: null };
        if (fee.error) errs.push(`עמלה: ${fee.error}`);
        if (errs.length) return setErrors(errs);
        services.atmService.withdraw({ tripId, received: main.value!, fee: fee.value, cardId: atmCard, occurrence: when(), place, note });
      } else {
        if (counted.error) errs.push(counted.error);
        if (errs.length) return setErrors(errs);
        if (diff && diff.minor !== 0) services.reconciliationService.reconcile({ tripId, counted: counted.value!, note });
      }
      notifyChanged();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setErrors(['השמירה נכשלה. לא נשמר דבר — נסו שוב.']);
    }
  }

  const cardLabel = (id: number | null) => {
    if (id === null) return he.payment.unspecifiedCard;
    const c = ctx.cards.find((x) => x.id === id);
    return c ? c.nickname || he.issuers[c.issuer] || 'כרטיס' : 'כרטיס';
  };

  return (
    <Screen testID="screen-addaction" footer={<Button label={he.common.save} icon="check" onPress={save} testID="add-save" />}>
      <Row justify="space-between">
        <AppText variant="title">{mode === 'CASH_ADJUSTMENT' ? he.types.CASH_ADJUSTMENT : 'פעולה חדשה'}</AppText>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="סגירה" hitSlop={12} testID="add-close">
          <Icon name="close" color={colors.inkMuted} />
        </Pressable>
      </Row>

      {mode !== 'CASH_ADJUSTMENT' ? (
        <View style={styles.segment}>
          {MODES.map((m) => (
            <Pressable key={m} onPress={() => { setMode(m); setErrors([]); setShowErrors(false); }} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} testID={`mode-${m}`} style={[styles.segmentItem, mode === m && styles.segmentSelected]}>
              <AppText variant="label" color={mode === m ? colors.primaryInk : colors.ink} center>
                {m === 'EXPENSE' ? 'הוצאה' : m === 'FX_EXCHANGE' ? 'המרה' : 'כספומט'}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {errors.length ? <Banner tone="danger" title="לא נשמר" body={errors.join('\n')} testID="add-errors" /> : null}

      {mode === 'EXPENSE' ? (
        <>
          <MoneyEntry label="סכום" id="expense" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors && amountText !== '' ? main.error : null} />
          <SectionTitle title="קטגוריה" />
          <View style={styles.grid}>
            {ctx.categories.map((c) => {
              const selected = categoryId === c.id;
              return (
                <Pressable key={c.id} onPress={() => setCategoryId(c.id)} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={categoryLabel(c)} testID={`category-${c.builtinKey ?? c.id}`} style={[styles.tile, selected && styles.tileSelected]}>
                  <Icon name={categoryIcon(c.icon)} color={selected ? colors.primaryInk : colors.primary} />
                  <AppText variant="caption" color={selected ? colors.primaryInk : colors.ink} center numberOfLines={2}>
                    {categoryLabel(c)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <SectionTitle title="אמצעי תשלום" />
          <Row wrap>
            <Chip label={he.payment.CASH} icon="cash" selected={payment.method === 'CASH'} onPress={() => setPayment({ method: 'CASH' })} testID="pay-cash" />
            {ctx.cards.map((c) => (
              <Chip key={c.id} label={cardLabel(c.id)} icon="credit-card-outline" selected={payment.method === 'CARD' && payment.cardId === c.id} onPress={() => setPayment({ method: 'CARD', cardId: c.id })} testID={`pay-card-${c.id}`} />
            ))}
            <Chip label={ctx.cards.length ? 'כרטיס אחר' : he.payment.unspecifiedCard} icon="credit-card-outline" selected={payment.method === 'CARD' && payment.cardId === null} onPress={() => setPayment({ method: 'CARD', cardId: null })} testID="pay-card-any" />
          </Row>
          {payment.method === 'CARD' ? (
            <AppText variant="caption" color={colors.inkMuted}>
              תשלום באשראי נספר כהוצאה אבל לא מוריד מזומן מהארנק.
            </AppText>
          ) : null}
        </>
      ) : null}

      {mode === 'FX_EXCHANGE' ? (
        <>
          <MoneyEntry label="נתתי" id="fx-given" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors ? main.error : null} />
          <MoneyEntry label="קיבלתי" id="fx-received" big text={otherText} onText={setOtherText} currency={otherCurrency} onCurrency={() => setPicker('other')} error={showErrors ? other.error : null} />
          {rate ? (
            <Card testID="fx-rate">
              <AppText variant="label" color={colors.inkMuted}>
                שער בפועל
              </AppText>
              <AppText variant="heading">{formatRate(rate.from, rate.to, rate.rate)}</AppText>
            </Card>
          ) : null}
          <AppText variant="caption" color={colors.inkMuted}>
            המרה מעבירה כסף בין ארנקים — היא לא נספרת כהוצאה.
          </AppText>
        </>
      ) : null}

      {mode === 'ATM_WITHDRAWAL' ? (
        <>
          <MoneyEntry label="כמה מזומן קיבלתי" id="atm" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors ? main.error : null} />
          <Field label={`עמלת כספומט מקומית (${currency}) — ${he.common.optional}`} value={feeText} onChangeText={setFeeText} keyboardType="decimal-pad" ltrInput testID="atm-fee" />
          <SectionTitle title="מאיזה כרטיס" />
          <Row wrap>
            {ctx.cards.map((c) => (
              <Chip key={c.id} label={cardLabel(c.id)} icon="credit-card-outline" selected={atmCard === c.id} onPress={() => setAtmCard(c.id)} testID={`atm-card-${c.id}`} />
            ))}
            <Chip label={ctx.cards.length ? 'כרטיס אחר' : he.payment.unspecifiedCard} icon="credit-card-outline" selected={atmCard === null} onPress={() => setAtmCard(null)} testID="atm-card-any" />
          </Row>
          <AppText variant="caption" color={colors.inkMuted}>
            משיכה מוסיפה מזומן לארנק ואינה הוצאה. העמלה נרשמת כעלות של הטיול.
          </AppText>
        </>
      ) : null}

      {mode === 'CASH_ADJUSTMENT' ? (
        <>
          <AppText color={colors.inkMuted}>ספרו את המזומן בארנק והזינו כמה יש בפועל. האפליקציה תרשום את ההפרש כתיקון — היתרה תמיד מחושבת מהפעולות.</AppText>
          <Card>
            <Row justify="space-between">
              <AppText variant="label" color={colors.inkMuted}>
                יתרה רשומה
              </AppText>
              <AppText variant="heading" color={currentBalance.minor < 0 ? colors.danger : colors.ink}>
                {formatMoney(currentBalance)}
              </AppText>
            </Row>
          </Card>
          <MoneyEntry label="כמה יש בארנק בפועל" id="adjust" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors ? counted.error : null} />
          {diff ? (
            <Card testID="adjust-diff">
              <AppText variant="label" color={colors.inkMuted}>
                {diff.minor === 0 ? 'אין הפרש — לא יירשם תיקון' : 'ההפרש שיירשם'}
              </AppText>
              {diff.minor !== 0 ? <AppText variant="heading">{formatMoney(diff, { signed: true })}</AppText> : null}
            </Card>
          ) : null}
        </>
      ) : null}

      <Collapsible title={he.common.more} testID="add-advanced">
        <Row align="flex-start">
          <DateField label="תאריך" value={date} onChange={(d) => { setDate(d); setWhenTouched(true); }} testID="add-date" />
          <View style={{ flex: 1 }}>
            <Field label="שעה" value={time} onChangeText={(t) => { setTime(t); setWhenTouched(true); }} placeholder="HH:MM" keyboardType="numbers-and-punctuation" ltrInput maxLength={5} testID="add-time" />
          </View>
        </Row>
        {mode === 'EXPENSE' ? <Field label="תיאור" value={description} onChangeText={setDescription} maxLength={120} placeholder="למשל: ארוחת ערב" testID="add-description" /> : null}
        <Field label="מקום" value={place} onChangeText={setPlace} maxLength={120} placeholder="למשל: צ׳יאנג מאי" testID="add-place" />
        <Field label="הערה" value={note} onChangeText={setNote} maxLength={500} multiline testID="add-note" />
        {mode === 'EXPENSE' && payment.method === 'CARD' ? (
          <Card>
            <Pressable onPress={() => setDcc((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: dcc }} testID="add-dcc">
              <Row>
                <Icon name={dcc ? 'checkbox-marked' : 'checkbox-blank-outline'} color={colors.primary} />
                <AppText>חויבתי במטבע אחר</AppText>
              </Row>
            </Pressable>
            <AppText variant="caption" color={colors.inkMuted}>
              לפעמים בית העסק מציע לחייב בשקלים או בדולרים במקום במטבע המקומי (DCC). אם זה קרה — סמנו ורשמו מה הופיע בקבלה.
            </AppText>
            {dcc ? (
              <View style={{ gap: space.xs }}>
                <Row>
                  <CurrencyButton code={chargedCurrency} onPress={() => setPicker('charged')} testID="charged-currency" />
                  <AmountInput value={chargedText} onChange={setChargedText} placeholder="סכום (אם ידוע)" testID="charged-amount" />
                </Row>
              </View>
            ) : null}
          </Card>
        ) : null}
      </Collapsible>

      <View style={styles.moreActions}>
        {mode !== 'CASH_ADJUSTMENT' ? (
          <Button compact tone="ghost" icon="scale-balance" label="פעולות נוספות: תיקון יתרת מזומן" onPress={() => { setMode('CASH_ADJUSTMENT'); setErrors([]); setShowErrors(false); }} testID="mode-CASH_ADJUSTMENT" />
        ) : (
          <Button compact tone="ghost" icon="arrow-left" label="חזרה להוספת הוצאה" onPress={() => setMode('EXPENSE')} testID="mode-back" />
        )}
      </View>

      <CurrencyPicker
        visible={picker !== null}
        selected={picker === 'main' ? currency : picker === 'other' ? otherCurrency : chargedCurrency}
        suggested={[...new Set([...ctx.wallets.map((w) => w.currency), ctx.trip.reportingCurrency, 'USD', 'EUR'])]}
        onClose={() => setPicker(null)}
        onSelect={(c) => {
          if (picker === 'main') setCurrency(c);
          else if (picker === 'other') setOtherCurrency(c);
          else setChargedCurrency(c);
          setPicker(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31%', minHeight: 72, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.xs },
  tileSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  collapse: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40 },
  moreActions: { alignItems: 'flex-start' },
});
