import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActualChargeError } from '../../application/transactions/TransactionService';
import { exchangeRateView } from '../../domain/fx';
import type { CardCharge } from '../../domain/ledger';
import { money, type Money } from '../../domain/money';
import { localDateOf, localTimeOf } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { Flag } from '../components/Flag';
import { HeaderButton, PhotoHeader } from '../components/PhotoHeader';
import { AmountInput } from '../components/pickers';
import { ReceiptSection } from '../components/ReceiptSection';
import { AppText, Banner, Button, Card, Divider, EmptyState, Icon, IconTile, Row, Screen, SectionTitle, type IconName } from '../components/primitives';
import { formatDate, formatDateNumeric, formatMoney, formatRate, ltr, plainAmount } from '../format';
import { categoryLabel, he } from '../i18n/he';
import { categoryColor, categoryIcon } from '../present';
import { colors, radius, space } from '../theme/tokens';

function Line({ label, children, testID }: { label: string; children: ReactNode; testID?: string }) {
  return (
    <Row justify="space-between" align="flex-start" style={{ paddingVertical: 4 }}>
      <AppText variant="label" color={colors.inkMuted}>
        {label}
      </AppText>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }} testID={testID}>
        {typeof children === 'string' ? <AppText>{children}</AppText> : children}
      </View>
    </Row>
  );
}

/** One cell of the approved 2×2 details grid: icon, small label, value lines. */
function Cell({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <View style={styles.cell}>
      <Icon name={icon} color={colors.primary} size={24} />
      <View style={styles.flex}>
        <AppText variant="caption" color={colors.inkMuted}>
          {label}
        </AppText>
        {typeof children === 'string' ? <AppText style={styles.bold}>{children}</AppText> : children}
      </View>
    </View>
  );
}

const FEE_TEXT: Record<CardCharge['feeStatus'], string> = {
  INCLUDED: 'כולל עמלת המרה לפי סיווג הכרטיס',
  NONE: 'הכרטיס מסווג ללא עמלת מט״ח',
  UNKNOWN: 'לא כולל עמלות אפשריות של חברת האשראי',
};

const HISTORY_TEXT: Record<string, string> = { CREATE: 'נוצר', EDIT: 'נערך', DELETE: 'נמחק', ACTUAL_CHARGE: 'עודכן חיוב בפועל' };

function CardChargeSection({ id, charge, onSaved }: { id: number; charge: CardCharge; onSaved: () => void }) {
  const { services } = useApp();
  const billing = charge.billingCurrency;
  const [text, setText] = useState(charge.actualMinor !== null ? plainAmount(money(charge.actualMinor, billing)) : '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      services.transactionService.setActualCharge(id, text);
      setError(null);
      onSaved();
    } catch (e) {
      setError(e instanceof ActualChargeError ? 'סכום לא תקין' : 'השמירה נכשלה');
    }
  };
  return (
    <Card testID="card-charge">
      <SectionTitle title="חיוב בכרטיס" icon="credit-card-outline" />
      {charge.chargedAmountMinor !== null || charge.chargedCurrency ? (
        <Line label="חויב במטבע">{charge.chargedAmountMinor !== null ? formatMoney(money(charge.chargedAmountMinor, charge.chargedCurrency)) : charge.chargedCurrency}</Line>
      ) : null}
      <Line label="הערכה" testID="charge-estimate">
        {charge.status === 'ESTIMATED' && charge.estimateMinor !== null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <AppText>{`≈ ${formatMoney(money(charge.estimateMinor, billing))}`}</AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {FEE_TEXT[charge.feeStatus]}
            </AppText>
            {charge.rateSource && charge.rateDate ? (
              <AppText variant="caption" color={colors.inkMuted}>
                {`שער ייחוס ${charge.rateSource === 'ECB' ? 'הבנק המרכזי האירופי' : charge.rateSource === 'IDENTITY' ? '—' : charge.rateSource} · ${formatDate(charge.rateDate)}`}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText color={colors.warning}>אין עדיין שער להערכה</AppText>
        )}
      </Line>
      <Divider />
      <AppText variant="label" color={colors.inkMuted}>
        {`חיוב בפועל לפי הדף/האפליקציה של הכרטיס (${billing})`}
      </AppText>
      <Row>
        <AmountInput value={text} onChange={setText} placeholder="לא הוזן" testID="actual-amount" error={!!error} />
        <Button compact label="שמירה" onPress={save} testID="actual-save" />
      </Row>
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
      <AppText variant="caption" color={colors.inkMuted}>
        כשמוזן חיוב בפועל, הסיכומים משתמשים בו במקום בהערכה. ההערכה נשמרת לצורך השוואה.
      </AppText>
    </Card>
  );
}

export function ActionDetailsScreen() {
  const { services, notifyChanged } = useApp();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const data = useQuery(
    (s) => {
      const d = Number.isInteger(id) ? s.transactionService.details(id) : undefined;
      if (!d) return null;
      const draft = d.tx.draft;
      const reporting = s.tripService.getTrip(draft.tripId)?.reportingCurrency ?? 'ILS';
      const valued: Money | null = draft.type === 'EXPENSE' ? draft.amount : draft.type === 'ATM_WITHDRAWAL' ? draft.received : null;
      return {
        ...d,
        reporting,
        equivalent: valued && valued.currency !== reporting ? s.reportingService.equivalent(valued, reporting, draft.occurredLocalDate) : null,
        category: draft.type === 'EXPENSE' ? s.categoryService.get(draft.categoryId) : undefined,
        card: draft.type === 'EXPENSE' && draft.payment.method === 'CARD' && draft.payment.cardId !== null ? s.cardService.get(draft.payment.cardId) : draft.type === 'ATM_WITHDRAWAL' && draft.cardId !== null ? s.cardService.get(draft.cardId) : undefined,
        offset: s.tripService.offsetMinutes(),
      };
    },
    [id],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!data) {
    return (
      <Screen testID="screen-actiondetails">
        <EmptyState icon="file-question-outline" title="הפעולה לא נמצאה" />
        <Button label={he.common.back} tone="secondary" onPress={close} />
      </Screen>
    );
  }
  const { tx, history } = data;
  const d = tx.draft;
  const deleted = tx.deletedAt !== null;
  const cardName = data.card ? data.card.nickname || he.issuers[data.card.issuer] || 'כרטיס' : he.payment.unspecifiedCard;

  const confirmDelete = () =>
    Alert.alert('מחיקת פעולה', 'הפעולה תוסר מהיתרות, מהיומן ומהסיכומים. היסטוריית השינויים נשמרת.', [
      { text: he.common.cancel, style: 'cancel' },
      {
        text: he.common.delete,
        style: 'destructive',
        onPress: () => {
          services.transactionService.delete(tx.id);
          notifyChanged();
          close();
        },
      },
    ]);

  const edit = () => {
    if (d.type === 'OPENING_BALANCE') router.push(`/trip-setup?tripId=${d.tripId}`);
    else router.push(`/add?edit=${tx.id}`);
  };

  // Headline: title lines, the main amount (+ caption), icon tile.
  let title: string = he.types[d.type];
  let lines: string[] = [];
  let icon: IconName = 'cash';
  let iconColor: string = colors.primary;
  let amount: ReactNode;
  let cells: ReactNode;
  const when = (
    <Cell icon="clock-outline" label="תאריך ושעה">
      <AppText style={styles.bold}>{formatDateNumeric(d.occurredLocalDate)}</AppText>
      <AppText variant="label" color={colors.inkMuted}>
        {localTimeOf(d)}
      </AppText>
    </Cell>
  );
  const place = d.place ? <Cell icon="map-marker-outline" label="מקום">{d.place}</Cell> : null;
  switch (d.type) {
    case 'EXPENSE': {
      const cat = data.category ? categoryLabel(data.category) : he.types.EXPENSE;
      title = d.description || cat;
      lines = [d.place ?? '', [d.description ? cat : null, d.payment.method === 'CASH' ? he.payment.CASH : he.payment.CARD].filter(Boolean).join(' · ')].filter(Boolean);
      icon = data.category ? categoryIcon(data.category.icon) : 'cash';
      iconColor = data.category ? categoryColor(data.category.icon) : colors.primary;
      amount = (
        <AppText variant="display" color={colors.danger} testID="details-amount">
          {formatMoney(d.amount, { outflow: true })}
        </AppText>
      );
      cells = (
        <>
          <View style={styles.cellRow}>
            {place ?? <Cell icon="tag-outline" label="קטגוריה">{cat}</Cell>}
            {when}
          </View>
          <View style={[styles.cellRow, styles.cellRowTop]}>
            {place ? <Cell icon="tag-outline" label="קטגוריה">{cat}</Cell> : <View style={styles.flex} />}
            <Cell icon="wallet-outline" label="אמצעי תשלום">
              {d.payment.method === 'CASH' ? (
                <Row gap={6}>
                  <Flag currency={d.amount.currency} size={18} />
                  <AppText style={styles.bold}>{`${he.payment.CASH} (${ltr(d.amount.currency)})`}</AppText>
                </Row>
              ) : (
                <>
                  <AppText style={styles.bold}>{cardName}</AppText>
                  <AppText variant="caption" color={colors.inkMuted}>
                    הוצאה באשראי — לא מורידה מזומן מהארנק
                  </AppText>
                </>
              )}
            </Cell>
          </View>
        </>
      );
      break;
    }
    case 'FX_EXCHANGE': {
      const r = exchangeRateView(d.given, d.received).display;
      icon = 'swap-horizontal';
      iconColor = colors.fx;
      lines = ['המרה אינה הוצאה — היא מעבירה כסף בין ארנקים'];
      amount = (
        <AppText variant="title" testID="details-amount">
          {`${formatMoney(d.given)} → ${formatMoney(d.received)}`}
        </AppText>
      );
      cells = (
        <>
          <View style={styles.cellRow}>
            <Cell icon="arrow-up-circle-outline" label="נתתי">{formatMoney(d.given)}</Cell>
            <Cell icon="arrow-down-circle-outline" label="קיבלתי">{formatMoney(d.received)}</Cell>
          </View>
          <View style={[styles.cellRow, styles.cellRowTop]}>
            <Cell icon="swap-horizontal" label="שער בפועל">{formatRate(r.from, r.to, r.rate)}</Cell>
            {when}
          </View>
          {place ? <View style={[styles.cellRow, styles.cellRowTop]}>{place}</View> : null}
        </>
      );
      break;
    }
    case 'ATM_WITHDRAWAL':
      icon = 'cash-plus';
      iconColor = colors.atm;
      lines = ['המשיכה אינה הוצאה. העמלה נספרת כעלות הטיול'];
      amount = (
        <AppText variant="display" color={colors.success} testID="details-amount">
          {formatMoney(d.received, { signed: true })}
        </AppText>
      );
      cells = (
        <>
          <View style={styles.cellRow}>
            {place ?? <Cell icon="credit-card-outline" label="כרטיס">{cardName}</Cell>}
            {when}
          </View>
          <View style={[styles.cellRow, styles.cellRowTop]}>
            {place ? <Cell icon="credit-card-outline" label="כרטיס">{cardName}</Cell> : <View style={styles.flex} />}
            <Cell icon="bank-outline" label="עמלת כספומט">{d.fee ? formatMoney(d.fee) : he.common.none}</Cell>
          </View>
        </>
      );
      break;
    case 'CASH_ADJUSTMENT':
      icon = 'scale-balance';
      iconColor = colors.warning;
      lines = [d.delta.minor < 0 ? 'חסר מזומן' : 'נמצא מזומן נוסף'];
      amount = (
        <AppText variant="display" color={d.delta.minor < 0 ? colors.danger : colors.success} testID="details-amount">
          {formatMoney(d.delta, { signed: true })}
        </AppText>
      );
      cells = <View style={styles.cellRow}>{when}</View>;
      break;
    case 'OPENING_BALANCE':
      icon = 'wallet-outline';
      iconColor = colors.inkMuted;
      lines = ['יתרת פתיחה נערכת בעריכת הטיול'];
      amount = (
        <AppText variant="display" testID="details-amount">
          {formatMoney(d.amount)}
        </AppText>
      );
      cells = <View style={styles.cellRow}>{when}</View>;
      break;
  }
  const valued = d.type === 'EXPENSE' ? d.amount : d.type === 'ATM_WITHDRAWAL' ? d.received : null;

  return (
    <Screen
      testID="screen-actiondetails"
      header={
        <PhotoHeader
          compact
          strong
          title="פרטי פעולה"
          start={
            deleted ? undefined : (
              <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel={he.common.edit} hitSlop={10} testID="details-edit" style={styles.editLink}>
                <Icon name="pencil" color="#fff" size={22} />
                <AppText variant="heading" color="#fff">
                  ערוך
                </AppText>
              </Pressable>
            )
          }
          end={<HeaderButton icon="chevron-left" label="חזרה" onPress={close} testID="details-close" />}
        />
      }
      footer={deleted ? undefined : <Button label="מחק פעולה" icon="trash-can-outline" tone="dangerSoft" onPress={confirmDelete} testID="details-delete" />}>
      <Card style={styles.top}>
        <View style={styles.topAmount}>
          {amount}
          {d.type === 'EXPENSE' ? (
            <AppText variant="label" color={colors.inkMuted}>
              {d.amount.currency}
            </AppText>
          ) : null}
          {data.equivalent ? <AppText variant="label" color={colors.inkMuted}>{`≈ ${formatMoney(data.equivalent.amount)}`}</AppText> : null}
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" numberOfLines={2}>
            {title}
          </AppText>
          {lines.map((l) => (
            <AppText key={l} variant="label" color={colors.inkMuted}>
              {l}
            </AppText>
          ))}
        </View>
        <IconTile icon={icon} color={iconColor} size={64} />
      </Card>
      {deleted ? <Banner tone="warning" title="הפעולה נמחקה" body="היא לא משפיעה על יתרות, יומן או סיכומים." testID="details-deleted" /> : null}

      <Card>{cells}</Card>

      {data.equivalent && valued ? (
        <View style={styles.conversion} testID="details-conversion">
          <Icon name="swap-horizontal" color={colors.primary} size={26} />
          <View style={styles.flex}>
            <AppText variant="heading">{`המרה ל-${data.reporting}`}</AppText>
            <AppText variant="label" color={colors.inkMuted}>{formatMoney(valued)}</AppText>
            <AppText variant="title" color={colors.success}>
              {formatMoney(data.equivalent.amount)}
            </AppText>
          </View>
          <View style={styles.rateBox}>
            <AppText variant="caption" color={colors.inkMuted}>
              שער ייחוס ביום הפעולה
            </AppText>
            <AppText variant="label" style={styles.bold}>
              {formatRate(data.equivalent.rate.from, data.equivalent.rate.to, data.equivalent.rate.rate)}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {formatDateNumeric(data.equivalent.rateDate)}
            </AppText>
          </View>
        </View>
      ) : null}

      {d.note ? (
        <Card>
          <SectionTitle title="הערות" icon="file-document-outline" />
          <View style={styles.note}>
            <AppText>{d.note}</AppText>
          </View>
        </Card>
      ) : null}

      {tx.cardCharge && !deleted ? <CardChargeSection key={`${tx.id}-${tx.revision}`} id={tx.id} charge={tx.cardCharge} onSaved={notifyChanged} /> : null}
      {!deleted && d.type !== 'OPENING_BALANCE' ? <ReceiptSection transactionId={tx.id} /> : null}

      <Card testID="details-history">
        <SectionTitle title="היסטוריית שינויים" icon="history" />
        {history.map((h, i) => (
          <Row key={i} justify="space-between" style={{ paddingVertical: space.xs }}>
            <AppText variant="label">{HISTORY_TEXT[h.action] ?? h.action}</AppText>
            <AppText variant="caption" color={colors.inkMuted}>{`${formatDateNumeric(localDateOf(h.changedAt, data.offset))} · ${localTimeOf({ occurredAt: h.changedAt, occurredLocalDate: '', tzOffsetMin: data.offset })}`}</AppText>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  topAmount: { alignItems: 'flex-start' },
  cellRow: { flexDirection: 'row', gap: space.md },
  cellRowTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.md, marginTop: space.xs },
  cell: { flex: 1, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  conversion: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg - 4, backgroundColor: colors.successSoft },
  rateBox: { alignItems: 'center', padding: space.sm, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.7)' },
  note: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: space.md },
});
