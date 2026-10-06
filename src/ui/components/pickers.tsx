import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { currencyInfo, SUPPORTED_CURRENCIES } from '../../domain/money';
import { addDays } from '../../domain/time';
import { formatDate, formatDateShort, ltr } from '../format';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText, Icon, Row } from './primitives';
import { Sheet } from './Sheet';

/** Currency chooser: frequently used first, then all supported currencies, with search. */
export function CurrencyPicker(props: { visible: boolean; title?: string; selected?: string; suggested?: readonly string[]; exclude?: readonly string[]; onSelect: (code: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const all = SUPPORTED_CURRENCIES.filter((c) => !props.exclude?.includes(c.code)).filter(
      (c) => !term || c.code.toLowerCase().includes(term) || c.nameHe.includes(q.trim()),
    );
    const sug = new Set(props.suggested ?? []);
    return [...all.filter((c) => sug.has(c.code)), ...all.filter((c) => !sug.has(c.code))];
  }, [q, props.exclude, props.suggested]);
  return (
    <Sheet visible={props.visible} title={props.title ?? 'בחירת מטבע'} onClose={props.onClose} testID="currency-picker">
      <TextInput value={q} onChangeText={setQ} placeholder="חיפוש (למשל THB או באט)" placeholderTextColor={colors.inkFaint} style={styles.search} testID="currency-search" />
      {list.map((c) => (
        <Pressable
          key={c.code}
          testID={`currency-${c.code}`}
          accessibilityRole="button"
          onPress={() => {
            props.onSelect(c.code);
            setQ('');
          }}
          style={({ pressed }) => [styles.option, c.code === props.selected && styles.optionSelected, pressed && { opacity: 0.7 }]}>
          <Row justify="space-between">
            <AppText>{c.nameHe}</AppText>
            <AppText variant="label" color={colors.inkMuted}>
              {ltr(`${c.code} ${c.symbol}`)}
            </AppText>
          </Row>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** Pressable field that shows a currency code and opens the picker. */
export function CurrencyButton({ code, onPress, testID }: { code: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={`מטבע ${code}`} style={({ pressed }) => [styles.currencyBtn, pressed && { opacity: 0.7 }]}>
      <AppText variant="heading">{ltr(`${currencyInfo(code).symbol} ${code}`)}</AppText>
      <Icon name="chevron-down" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

/** Numeric amount input: LTR digits, decimal keypad, large type for fast entry. */
export function AmountInput(props: { value: string; onChange: (s: string) => void; testID?: string; autoFocus?: boolean; error?: boolean; placeholder?: string; big?: boolean }) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChange}
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoFocus={props.autoFocus}
      placeholder={props.placeholder ?? '0'}
      placeholderTextColor={colors.inkFaint}
      testID={props.testID}
      accessibilityLabel="סכום"
      style={[styles.amount, props.big && styles.amountBig, props.error && styles.amountError]}
    />
  );
}

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Month-grid date chooser (RTL: Sunday on the right). Dates are 'YYYY-MM-DD'. */
export function CalendarSheet(props: { visible: boolean; title: string; value: string; min?: string; onSelect: (d: string) => void; onClose: () => void }) {
  const [month, setMonth] = useState(props.value.slice(0, 7));
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  return (
    <Sheet visible={props.visible} title={props.title} onClose={props.onClose} testID="calendar">
      <Row justify="space-between">
        <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="חודש קודם" hitSlop={12} testID="cal-prev">
          <Icon name="chevron-left" directional />
        </Pressable>
        <AppText variant="heading">{`${MONTHS[m - 1]} ${y}`}</AppText>
        <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="חודש הבא" hitSlop={12} testID="cal-next">
          <Icon name="chevron-right" directional />
        </Pressable>
      </Row>
      <View style={styles.grid}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.cell}>
            <AppText variant="caption" color={colors.inkMuted} center>
              {w}
            </AppText>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const disabled = props.min !== undefined && d < props.min;
          const selected = d === props.value;
          return (
            <Pressable
              key={d}
              disabled={disabled}
              testID={`day-${d}`}
              accessibilityRole="button"
              accessibilityLabel={formatDate(d)}
              onPress={() => props.onSelect(d)}
              style={[styles.cell, styles.day, selected && styles.daySelected, disabled && { opacity: 0.3 }]}>
              <AppText center color={selected ? colors.primaryInk : colors.ink}>
                {Number(d.slice(8))}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Field showing a date that opens the calendar. */
export function DateField(props: { label: string; value: string; min?: string; onChange: (d: string) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <AppText variant="label" color={colors.inkMuted}>
        {props.label}
      </AppText>
      <Pressable onPress={() => setOpen(true)} testID={props.testID} accessibilityRole="button" accessibilityLabel={`${props.label}: ${formatDate(props.value)}`} style={styles.dateBtn}>
        <Icon name="calendar-month-outline" size={20} color={colors.inkMuted} />
        <AppText numberOfLines={1}>{formatDateShort(props.value)}</AppText>
      </Pressable>
      {open ? (
        <CalendarSheet
          visible
          title={props.label}
          value={props.value}
          min={props.min}
          onClose={() => setOpen(false)}
          onSelect={(d) => {
            props.onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: touch, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, fontSize: 16, color: colors.ink, textAlign: 'right' },
  option: { paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.sm },
  optionSelected: { backgroundColor: colors.primarySoft },
  currencyBtn: { minHeight: touch, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  amount: { minHeight: touch, flex: 1, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, fontSize: 20, color: colors.ink, textAlign: 'left', writingDirection: 'ltr' },
  amountBig: { fontSize: 34, minHeight: 64, fontWeight: '600' },
  amountError: { borderColor: colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { borderRadius: 22 },
  daySelected: { backgroundColor: colors.primary },
  dateBtn: { minHeight: touch, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
