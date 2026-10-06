import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { JournalFilter } from '../../application/ports/JournalQueries';
import type { TransactionType } from '../../domain/ledger';
import { useQuery } from '../AppContext';
import { ActionRow } from '../components/ActionRow';
import { AppText, Card, Chip, EmptyState, Icon, Row, Screen, SectionTitle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { formatDayHeader, formatMoney } from '../format';
import { categoryLabel, he } from '../i18n/he';
import { colors, radius, space, touch } from '../theme/tokens';

const TYPES: readonly TransactionType[] = ['EXPENSE', 'FX_EXCHANGE', 'ATM_WITHDRAWAL', 'CASH_ADJUSTMENT', 'OPENING_BALANCE'];

export function JournalScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TransactionType | undefined>(undefined);
  const [payment, setPayment] = useState<'CASH' | 'CARD' | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(params.category ? Number(params.category) : undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A category tile in Summary may navigate here with a new category.
  const [lastParam, setLastParam] = useState(params.category);
  if (params.category !== lastParam) {
    setLastParam(params.category);
    setCategoryId(params.category ? Number(params.category) : undefined);
  }

  const filter: JournalFilter = { search: search.trim() || undefined, type, paymentMethod: payment, categoryId };
  const data = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    if (!trip) return null;
    return {
      days: s.journalService.days(trip.id, filter),
      categories: new Map(s.categoryService.list().map((c) => [c.id, c])),
      allCategories: s.categoryService.list(),
      category: categoryId !== undefined ? s.categoryService.get(categoryId) : undefined,
    };
  }, [filter]);
  if (!data) return null;

  const active = [
    type ? { key: 'type', label: he.types[type], clear: () => setType(undefined) } : null,
    payment ? { key: 'pay', label: he.payment[payment], clear: () => setPayment(undefined) } : null,
    data.category ? { key: 'cat', label: categoryLabel(data.category), clear: () => { setCategoryId(undefined); router.setParams({ category: undefined }); } } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <Screen testID="screen-journal">
      <AppText variant="title">{he.tabs.journal}</AppText>
      <Row>
        <View style={styles.search}>
          <Icon name="magnify" size={20} color={colors.inkMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="חיפוש בתיאור, מקום או הערה" placeholderTextColor={colors.inkFaint} style={styles.searchInput} testID="journal-search" />
        </View>
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel="סינון" testID="journal-filter" style={styles.filterBtn}>
          <Icon name="filter-variant" color={active.length ? colors.primary : colors.ink} />
        </Pressable>
      </Row>
      {active.length ? (
        <Row wrap>
          {active.map((a) => (
            <Chip key={a.key} label={`${a.label} ✕`} selected onPress={a.clear} testID={`active-${a.key}`} />
          ))}
        </Row>
      ) : null}

      {data.days.length === 0 ? (
        <EmptyState icon="notebook-outline" title={active.length || search ? 'לא נמצאו פעולות' : 'היומן ריק'} body={active.length || search ? 'נסו לשנות את החיפוש או הסינון.' : 'כל פעולה שתוסיפו תופיע כאן.'} />
      ) : (
        data.days.map((d) => (
          <View key={d.date} style={{ gap: space.xs }} testID={`day-${d.date}`}>
            <SectionTitle
              title={formatDayHeader(d.date)}
              action={
                d.expenseTotal ? (
                  <AppText variant="label" color={colors.inkMuted} testID={`day-total-${d.date}`}>
                    {`הוצאות: ${formatMoney(d.expenseTotal.amount)}${d.expenseTotal.unavailableCount ? ` + ${d.expenseTotal.unavailableCount} ללא שער` : ''}`}
                  </AppText>
                ) : undefined
              }
            />
            <Card>
              {d.rows.map((r) => (
                <ActionRow key={r.id} row={r} categories={data.categories} />
              ))}
            </Card>
          </View>
        ))
      )}

      <Sheet visible={filtersOpen} title="סינון" onClose={() => setFiltersOpen(false)} testID="journal-filters">
        <SectionTitle title="סוג פעולה" />
        <Row wrap>
          <Chip label="הכול" selected={!type} onPress={() => setType(undefined)} testID="filter-type-all" />
          {TYPES.map((t) => (
            <Chip key={t} label={he.types[t]} selected={type === t} onPress={() => setType(t)} testID={`filter-type-${t}`} />
          ))}
        </Row>
        <SectionTitle title="אמצעי תשלום" />
        <Row wrap>
          <Chip label="הכול" selected={!payment} onPress={() => setPayment(undefined)} testID="filter-pay-all" />
          <Chip label={he.payment.CASH} selected={payment === 'CASH'} onPress={() => setPayment('CASH')} testID="filter-pay-CASH" />
          <Chip label={he.payment.CARD} selected={payment === 'CARD'} onPress={() => setPayment('CARD')} testID="filter-pay-CARD" />
        </Row>
        <SectionTitle title="קטגוריה" />
        <Row wrap>
          <Chip label="הכול" selected={categoryId === undefined} onPress={() => setCategoryId(undefined)} testID="filter-cat-all" />
          {data.allCategories.map((c) => (
            <Chip key={c.id} label={categoryLabel(c)} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} testID={`filter-cat-${c.builtinKey ?? c.id}`} />
          ))}
        </Row>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flex: 1, minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, textAlign: 'right' },
  filterBtn: { width: touch, height: touch, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
