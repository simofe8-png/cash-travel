import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import type { ExpensePayment, Occurrence, StoredTransaction, TransactionType } from '../../domain/ledger';
import { exchangeRateView } from '../../domain/fx';
import { money, parseAmount, type Money } from '../../domain/money';
import { localTimeOf, occurrenceAtLocal } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { AmountInput, CurrencyButton, CurrencyPicker, DateField } from '../components/pickers';
import { AppText, Banner, Button, Card, Field, Icon, Row, Screen, type IconName } from '../components/primitives';
import { formatMoney, formatRate, plainAmount } from '../format';
import { categoryLabel, he } from '../i18n/he';
import { categoryColor, categoryIcon } from '../present';
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

const MODE_STYLE: Record<Exclude<Mode, 'CASH_ADJUSTMENT'>, { label: string; icon: IconName; color: string }> = {
  EXPENSE: { label: 'הוצאה', icon: 'silverware-fork-knife', color: colors.primary },
  FX_EXCHANGE: { label: 'המרת מטבע', icon: 'swap-horizontal', color: colors.primary },
  ATM_WITHDRAWAL: { label: 'משיכת מזומן', icon: 'cash-plus', color: colors.atm },
};

function Label({ children }: { children: string }) {
  return (
    <AppText variant="label" color={colors.inkMuted}>
      {children}
    </AppText>
  );
}

/** Selectable tile (category / payment method) in the approved Add Action style. */
function Tile(props: { label: string; icon: IconName; color: string; selected: boolean; onPress: () => void; testID?: string; wide?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      testID={props.testID}
      style={({ pressed }) => [styles.tile, props.wide && styles.tileWide, { backgroundColor: props.selected ? colors.primarySoft : `${props.color}12` }, props.selected && styles.tileSelected, pressed && { opacity: 0.7 }]}>
      <Icon name={props.icon} color={props.color} size={26} />
      <AppText variant="caption" color={props.selected ? colors.primary : colors.ink} center numberOfLines={1} style={props.selected ? styles.bold : undefined}>
        {props.label}
      </AppText>
    </Pressable>
  );
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

interface Prefill {
  mode: Mode;
  amountText: string;
  currency: string;
  categoryId: number | null;
  payment: ExpensePayment | null;
  description: string;
  place: string;
  note: string;
  dcc: boolean;
  chargedCurrency: string;
  chargedText: string;
  otherText: string;
  otherCurrency: string | null;
  feeText: string;
  atmCard: number | null | undefined;
  occurrence: Occurrence | null;
}

/** Form values for editing an existing action (Action Details → Edit). */
function prefillFrom(tx: StoredTransaction | null): Prefill | null {
  if (!tx || tx.draft.type === 'OPENING_BALANCE') return null;
  const d = tx.draft;
  const base: Prefill = {
    mode: d.type,
    amountText: '',
    currency: 'ILS',
    categoryId: null,
    payment: null,
    description: d.description ?? '',
    place: d.place ?? '',
    note: d.note ?? '',
    dcc: false,
    chargedCurrency: 'ILS',
    chargedText: '',
    otherText: '',
    otherCurrency: null,
    feeText: '',
    atmCard: undefined,
    occurrence: d,
  };
  switch (d.type) {
    case 'EXPENSE': {
      const cc = tx.cardCharge;
      const dcc = !!cc && cc.chargedCurrency !== d.amount.currency;
      return {
        ...base,
        amountText: plainAmount(d.amount),
        currency: d.amount.currency,
        categoryId: d.categoryId,
        payment: d.payment,
        dcc,
        chargedCurrency: dcc ? cc!.chargedCurrency : 'ILS',
        chargedText: dcc && cc!.chargedAmountMinor !== null ? plainAmount(money(cc!.chargedAmountMinor, cc!.chargedCurrency)) : '',
      };
    }
    case 'FX_EXCHANGE':
      return { ...base, amountText: plainAmount(d.given), currency: d.given.currency, otherText: plainAmount(d.received), otherCurrency: d.received.currency };
    case 'ATM_WITHDRAWAL':
      return { ...base, amountText: plainAmount(d.received), currency: d.received.currency, feeText: d.fee ? plainAmount(d.fee) : '', atmCard: d.cardId };
    case 'CASH_ADJUSTMENT':
      return { ...base, amountText: `${d.delta.minor < 0 ? '-' : ''}${plainAmount(d.delta)}`, currency: d.delta.currency };
  }
}

export function AddActionScreen() {
  const { services, notifyChanged } = useApp();
  const params = useLocalSearchParams<{ mode?: string; currency?: string; edit?: string }>();
  const editId = params.edit ? Number(params.edit) : null;
  const pre = useQuery((s) => (editId === null ? null : prefillFrom(s.transactionService.details(editId)?.tx ?? null)), [editId]);
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
  const initialMode = pre?.mode ?? (['EXPENSE', 'FX_EXCHANGE', 'ATM_WITHDRAWAL', 'CASH_ADJUSTMENT'] as const).find((m) => m === params.mode) ?? 'EXPENSE';
  const [mode, setMode] = useState<Mode>(initialMode);
  const startCurrency = pre?.currency ?? params.currency ?? ctx?.defaults.currency ?? 'ILS';

  // Shared
  const [amountText, setAmountText] = useState(pre?.amountText ?? '');
  const [currency, setCurrency] = useState(startCurrency);
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [picker, setPicker] = useState<null | 'main' | 'other' | 'charged'>(null);
  // Expense
  const [categoryId, setCategoryId] = useState<number | null>(pre?.categoryId ?? null);
  const [payment, setPayment] = useState<ExpensePayment>(pre?.payment ?? ctx?.defaults.payment ?? { method: 'CASH' });
  const [description, setDescription] = useState(pre?.description ?? '');
  const [place, setPlace] = useState(pre?.place ?? '');
  const [note, setNote] = useState(pre?.note ?? '');
  const [dcc, setDcc] = useState(pre?.dcc ?? false);
  const [chargedCurrency, setChargedCurrency] = useState(pre?.chargedCurrency ?? 'ILS');
  const [chargedText, setChargedText] = useState(pre?.chargedText ?? '');
  // When (an edit keeps the original occurrence unless the user changes date/time)
  const now = pre?.occurrence ?? services.tripService.nowOccurrence();
  const [date, setDate] = useState(now.occurredLocalDate);
  const [time, setTime] = useState(localTimeOf(now));
  const [whenTouched, setWhenTouched] = useState(false);
  // FX
  const [otherText, setOtherText] = useState(pre?.otherText ?? '');
  const [otherCurrency, setOtherCurrency] = useState(pre?.otherCurrency ?? (ctx?.trip.reportingCurrency === startCurrency ? 'USD' : (ctx?.trip.reportingCurrency ?? 'ILS')));
  // ATM
  const [feeText, setFeeText] = useState(pre?.feeText ?? '');
  // Receipt captured before saving; attached right after the action is saved.
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [atmCard, setAtmCard] = useState<number | null>(pre?.atmCard !== undefined ? pre.atmCard : ctx?.defaults.payment.method === 'CARD' ? ctx.defaults.payment.cardId : null);

  const editing = editId !== null && pre !== null;
  const main = readAmount(amountText, currency);
  const other = readAmount(otherText, otherCurrency);
  const counted = readAmount(amountText, currency, true);
  const deltaParse = parseAmount(amountText, currency, { allowNegative: true });
  const delta = deltaParse.ok && deltaParse.minor !== 0 ? money(deltaParse.minor, currency) : null;
  const diff = useMemo(
    () => (ctx && mode === 'CASH_ADJUSTMENT' && counted.value ? services.reconciliationService.difference(ctx.trip.id, counted.value) : null),
    [ctx, mode, counted.value, services],
  );
  const rate = mode === 'FX_EXCHANGE' && main.value && other.value && main.value.currency !== other.value.currency ? exchangeRateView(main.value, other.value).display : null;
  const currentBalance = ctx?.wallets.find((w) => w.currency === currency)?.current ?? money(0, currency);
  const reportingCurrency = ctx?.trip.reportingCurrency ?? 'ILS';
  // Display-only reference equivalent (cached rates; never on the save path).
  const equivalent = useQuery(
    (s) => (main.value && main.value.currency !== reportingCurrency && (mode === 'EXPENSE' || mode === 'ATM_WITHDRAWAL') ? s.reportingService.equivalent(main.value, reportingCurrency, date) : null),
    [main.value, reportingCurrency, date, mode],
  );

  if (!ctx) return null;
  const tripId = ctx.trip.id;

  function when() {
    if (!whenTouched) return editing ? (pre.occurrence ?? undefined) : undefined;
    return occurrenceAtLocal(date, /^\d{2}:\d{2}$/.test(time) ? time : '12:00', services.tripService.offsetMinutes());
  }

  async function captureReceipt() {
    const r = await services.receiptService.capture();
    if (r.status === 'denied') Alert.alert('אין גישה למצלמה', 'כדי לצלם קבלה צריך לאשר גישה למצלמה. אפשר לאשר בהגדרות המכשיר.');
    if (r.status === 'captured') setReceiptUri(r.uri);
  }

  function save() {
    let newId: number | null = null;
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
        const input = { tripId, amount: main.value!, categoryId: categoryId!, payment, occurrence: when(), description, place, note, chargedIn };
        if (editing) services.expenseService.editExpense(editId, input);
        else newId = services.expenseService.addExpense(input);
      } else if (mode === 'FX_EXCHANGE') {
        if (main.error) errs.push(`נתתי: ${main.error}`);
        if (other.error) errs.push(`קיבלתי: ${other.error}`);
        if (currency === otherCurrency) errs.push('בהמרה צריך שני מטבעות שונים');
        if (errs.length) return setErrors(errs);
        const input = { tripId, given: main.value!, received: other.value!, occurrence: when(), place, note };
        if (editing) services.fxService.editExchange(editId, input);
        else newId = services.fxService.exchange(input);
      } else if (mode === 'ATM_WITHDRAWAL') {
        if (main.error) errs.push(main.error);
        const fee = feeText.trim() ? readAmount(feeText, currency, true) : { value: null, error: null };
        if (fee.error) errs.push(`עמלה: ${fee.error}`);
        if (errs.length) return setErrors(errs);
        const input = { tripId, received: main.value!, fee: fee.value, cardId: atmCard, occurrence: when(), place, note };
        if (editing) services.atmService.editWithdrawal(editId, input);
        else newId = services.atmService.withdraw(input);
      } else if (editing) {
        if (!delta) return setErrors(['נא להזין תיקון שונה מאפס (אפשר עם מינוס)']);
        services.reconciliationService.editAdjustment(editId, { tripId, delta, note, occurrence: when() });
      } else {
        if (counted.error) errs.push(counted.error);
        if (errs.length) return setErrors(errs);
        if (diff && diff.minor !== 0) services.reconciliationService.reconcile({ tripId, counted: counted.value!, note });
      }
      if (newId !== null && receiptUri) {
        services.receiptService.attach(newId, receiptUri).then(notifyChanged, () => Alert.alert('הפעולה נשמרה', 'אבל הקבלה לא נשמרה. אפשר לצלם שוב מפרטי הפעולה.'));
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

  const modeTile = (m: Exclude<Mode, 'CASH_ADJUSTMENT'>) => {
    const st = MODE_STYLE[m];
    const selected = mode === m;
    return (
      <Pressable
        key={m}
        onPress={() => {
          setMode(m);
          setErrors([]);
          setShowErrors(false);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={st.label}
        testID={`mode-${m}`}
        style={[styles.mode, selected && styles.modeSelected]}>
        <Icon name={st.icon} color={st.color} size={30} />
        <AppText variant="label" color={st.color} center numberOfLines={2} style={styles.bold}>
          {st.label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <Screen testID="screen-addaction" footer={<Button label={editing ? 'שמירת שינויים' : 'שמור פעולה'} onPress={save} testID="add-save" />}>
      <Row align="flex-start">
        <View style={styles.headerSide} />
        <View style={styles.headerTitles}>
          <AppText variant="title" center>
            {editing ? 'עריכת פעולה' : mode === 'CASH_ADJUSTMENT' ? he.types.CASH_ADJUSTMENT : 'הוספת פעולה'}
          </AppText>
          {!editing && mode !== 'CASH_ADJUSTMENT' ? (
            <AppText variant="label" color={colors.inkMuted} center>
              בחרו סוג פעולה והזינו את הפרטים
            </AppText>
          ) : null}
        </View>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="סגירה" hitSlop={12} testID="add-close" style={[styles.headerSide, styles.headerClose]}>
          <Icon name="close" color={colors.primary} size={30} />
        </Pressable>
      </Row>

      {mode !== 'CASH_ADJUSTMENT' && !editing ? <View style={styles.modes}>{MODES.map((m) => modeTile(m as Exclude<Mode, 'CASH_ADJUSTMENT'>))}</View> : null}

      {errors.length ? <Banner tone="danger" title="לא נשמר" body={errors.join('\n')} testID="add-errors" /> : null}

      <Card style={styles.form}>
        {mode === 'EXPENSE' ? (
          <>
            <MoneyEntry label="סכום" id="expense" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors && amountText !== '' ? main.error : null} />
            <Label>קטגוריה</Label>
            <View style={styles.grid}>
              {ctx.categories.map((c) => (
                <Tile key={c.id} label={categoryLabel(c)} icon={categoryIcon(c.icon)} color={categoryColor(c.icon)} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} testID={`category-${c.builtinKey ?? c.id}`} />
              ))}
            </View>
            <Label>אמצעי תשלום</Label>
            <View style={styles.grid}>
              <Tile wide label={he.payment.CASH} icon="cash" color={colors.success} selected={payment.method === 'CASH'} onPress={() => setPayment({ method: 'CASH' })} testID="pay-cash" />
              {ctx.cards.map((c) => (
                <Tile wide key={c.id} label={cardLabel(c.id)} icon="credit-card-outline" color={colors.card} selected={payment.method === 'CARD' && payment.cardId === c.id} onPress={() => setPayment({ method: 'CARD', cardId: c.id })} testID={`pay-card-${c.id}`} />
              ))}
              <Tile wide label={ctx.cards.length ? 'כרטיס אחר' : he.payment.unspecifiedCard} icon="credit-card-plus-outline" color={colors.card} selected={payment.method === 'CARD' && payment.cardId === null} onPress={() => setPayment({ method: 'CARD', cardId: null })} testID="pay-card-any" />
            </View>
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
              <View style={styles.infoPanel} testID="fx-rate">
                <Icon name="swap-horizontal" color={colors.primary} />
                <View style={styles.flex}>
                  <Label>שער בפועל</Label>
                  <AppText variant="heading">{formatRate(rate.from, rate.to, rate.rate)}</AppText>
                </View>
              </View>
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
            <Label>מאיזה כרטיס</Label>
            <View style={styles.grid}>
              {ctx.cards.map((c) => (
                <Tile wide key={c.id} label={cardLabel(c.id)} icon="credit-card-outline" color={colors.card} selected={atmCard === c.id} onPress={() => setAtmCard(c.id)} testID={`atm-card-${c.id}`} />
              ))}
              <Tile wide label={ctx.cards.length ? 'כרטיס אחר' : he.payment.unspecifiedCard} icon="credit-card-plus-outline" color={colors.card} selected={atmCard === null} onPress={() => setAtmCard(null)} testID="atm-card-any" />
            </View>
            <AppText variant="caption" color={colors.inkMuted}>
              משיכה מוסיפה מזומן לארנק ואינה הוצאה. העמלה נרשמת כעלות של הטיול.
            </AppText>
          </>
        ) : null}

        {mode === 'CASH_ADJUSTMENT' && editing ? (
          <MoneyEntry label="תיקון (חיובי = נמצא יותר מזומן, מינוס = חסר)" id="adjust-delta" big text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors && !delta ? 'נא להזין תיקון שונה מאפס' : null} />
        ) : null}

        {mode === 'CASH_ADJUSTMENT' && !editing ? (
          <>
            <AppText color={colors.inkMuted}>ספרו את המזומן בארנק והזינו כמה יש בפועל. האפליקציה תרשום את ההפרש כתיקון — היתרה תמיד מחושבת מהפעולות.</AppText>
            <Row justify="space-between" style={styles.infoPanel}>
              <Label>יתרה רשומה</Label>
              <AppText variant="heading" color={currentBalance.minor < 0 ? colors.danger : colors.ink}>
                {formatMoney(currentBalance)}
              </AppText>
            </Row>
            <MoneyEntry label="כמה יש בארנק בפועל" id="adjust" big autoFocus text={amountText} onText={setAmountText} currency={currency} onCurrency={() => setPicker('main')} error={showErrors ? counted.error : null} />
            {diff ? (
              <View style={styles.infoPanel} testID="adjust-diff">
                <View style={styles.flex}>
                  <Label>{diff.minor === 0 ? 'אין הפרש — לא יירשם תיקון' : 'ההפרש שיירשם'}</Label>
                  {diff.minor !== 0 ? <AppText variant="heading">{formatMoney(diff, { signed: true })}</AppText> : null}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <Row align="flex-start">
          <DateField
            label="תאריך"
            value={date}
            onChange={(d) => {
              setDate(d);
              setWhenTouched(true);
            }}
            testID="add-date"
          />
          <View style={styles.flex}>
            <Field
              label="שעה"
              value={time}
              onChangeText={(t) => {
                setTime(t);
                setWhenTouched(true);
              }}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
              ltrInput
              maxLength={5}
              testID="add-time"
            />
          </View>
        </Row>

        <Collapsible title="פרטים נוספים (לא חובה)" testID="add-advanced">
          {mode === 'EXPENSE' ? <Field label="תיאור" value={description} onChangeText={setDescription} maxLength={120} placeholder="למשל: ארוחת ערב" testID="add-description" /> : null}
          <Field label="מקום / שם" value={place} onChangeText={setPlace} maxLength={120} placeholder="למשל: Sompong Seafood" testID="add-place" />
          <Field label="הערה" value={note} onChangeText={setNote} maxLength={500} multiline testID="add-note" />
          {!editing ? (
            <View style={{ gap: space.xs }}>
              <Button compact tone="soft" icon="camera-outline" label={receiptUri ? 'החלפת הקבלה' : 'הוספת קבלה (צילום)'} onPress={captureReceipt} testID="add-receipt" />
              {receiptUri ? <Image source={{ uri: receiptUri }} style={{ width: '100%', height: 140, borderRadius: radius.sm }} resizeMode="cover" testID="add-receipt-thumb" /> : null}
            </View>
          ) : null}
          {mode === 'EXPENSE' && payment.method === 'CARD' ? (
            <View style={styles.infoPanel}>
              <View style={styles.flex}>
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
                  <Row style={{ marginTop: space.xs }}>
                    <CurrencyButton code={chargedCurrency} onPress={() => setPicker('charged')} testID="charged-currency" />
                    <AmountInput value={chargedText} onChange={setChargedText} placeholder="סכום (אם ידוע)" testID="charged-amount" />
                  </Row>
                ) : null}
              </View>
            </View>
          ) : null}
        </Collapsible>
      </Card>

      {equivalent ? (
        <View style={styles.equivalent} testID="add-equivalent">
          <Icon name="calculator-variant-outline" color={colors.primary} size={28} />
          <View style={styles.flex}>
            <Label>{`סה״כ ב-${reportingCurrency} (משוער)`}</Label>
            <AppText variant="title">{formatMoney(equivalent.amount)}</AppText>
          </View>
          <View style={styles.equivalentRate}>
            <Label>שער ייחוס</Label>
            <AppText variant="label">{formatRate(equivalent.rate.from, equivalent.rate.to, equivalent.rate.rate)}</AppText>
          </View>
        </View>
      ) : null}

      <View style={[styles.moreActions, editing && { display: 'none' }]}>
        {mode !== 'CASH_ADJUSTMENT' ? (
          <Button
            compact
            tone="ghost"
            icon="scale-balance"
            label="פעולות נוספות: תיקון יתרת מזומן"
            onPress={() => {
              setMode('CASH_ADJUSTMENT');
              setErrors([]);
              setShowErrors(false);
            }}
            testID="mode-CASH_ADJUSTMENT"
          />
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
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  headerSide: { width: 44 },
  headerClose: { alignItems: 'flex-end', paddingTop: 2 },
  headerTitles: { flex: 1, alignItems: 'center', gap: 2 },
  modes: { flexDirection: 'row', gap: space.sm },
  mode: { flex: 1, minHeight: 92, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.xs },
  modeSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1.5 },
  form: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 0, flexBasis: '15%', minWidth: 64, minHeight: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2, paddingVertical: space.sm, borderWidth: 1.5, borderColor: 'transparent' },
  tileWide: { flexBasis: '31%' },
  tileSelected: { borderColor: colors.primary },
  infoPanel: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  equivalent: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  equivalentRate: { alignItems: 'flex-end', flexShrink: 1 },
  collapse: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  moreActions: { alignItems: 'flex-start' },
});
