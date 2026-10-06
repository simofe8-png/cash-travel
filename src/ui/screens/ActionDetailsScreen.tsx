import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ActualChargeError } from '../../application/transactions/TransactionService';
import { exchangeRateView } from '../../domain/fx';
import type { CardCharge } from '../../domain/ledger';
import { money } from '../../domain/money';
import { localDateOf, localTimeOf } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { AmountInput } from '../components/pickers';
import { ReceiptSection } from '../components/ReceiptSection';
import { AppText, Banner, Button, Card, Divider, EmptyState, Icon, MoneyText, Row, Screen, SectionTitle } from '../components/primitives';
import { formatDate, formatMoney, formatRate, plainAmount } from '../format';
import { categoryLabel, he } from '../i18n/he';
import { colors, space } from '../theme/tokens';

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
      <AppText variant="heading">חיוב בכרטיס</AppText>
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
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
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
      return {
        ...d,
        category: draft.type === 'EXPENSE' ? s.categoryService.get(draft.categoryId) : undefined,
        card: (draft.type === 'EXPENSE' && draft.payment.method === 'CARD' && draft.payment.cardId !== null) ? s.cardService.get(draft.payment.cardId) : draft.type === 'ATM_WITHDRAWAL' && draft.cardId !== null ? s.cardService.get(draft.cardId) : undefined,
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

  let headline: ReactNode;
  let body: ReactNode = null;
  switch (d.type) {
    case 'EXPENSE':
      headline = <MoneyText value={d.amount} variant="display" testID="details-amount" />;
      body = (
        <>
          <Line label="קטגוריה">{data.category ? categoryLabel(data.category) : '—'}</Line>
          <Line label="תשלום">{d.payment.method === 'CASH' ? he.payment.CASH : `${he.payment.CARD} · ${cardName}`}</Line>
          {d.payment.method === 'CARD' ? (
            <AppText variant="caption" color={colors.inkMuted}>
              הוצאה באשראי — לא מורידה מזומן מהארנק.
            </AppText>
          ) : null}
        </>
      );
      break;
    case 'FX_EXCHANGE': {
      const r = exchangeRateView(d.given, d.received).display;
      headline = (
        <AppText variant="title" testID="details-amount">{`${formatMoney(d.given)} ← ${formatMoney(d.received)}`}</AppText>
      );
      body = (
        <>
          <Line label="נתתי">{formatMoney(d.given)}</Line>
          <Line label="קיבלתי">{formatMoney(d.received)}</Line>
          <Line label="שער בפועל">{formatRate(r.from, r.to, r.rate)}</Line>
          <AppText variant="caption" color={colors.inkMuted}>
            המרה אינה הוצאה — היא מעבירה כסף בין ארנקים.
          </AppText>
        </>
      );
      break;
    }
    case 'ATM_WITHDRAWAL':
      headline = <MoneyText value={d.received} variant="display" signed testID="details-amount" />;
      body = (
        <>
          <Line label="מזומן שהתקבל">{formatMoney(d.received)}</Line>
          <Line label="עמלת כספומט">{d.fee ? formatMoney(d.fee) : he.common.none}</Line>
          <Line label="כרטיס">{cardName}</Line>
          <AppText variant="caption" color={colors.inkMuted}>
            המשיכה אינה הוצאה. העמלה נספרת כעלות הטיול.
          </AppText>
        </>
      );
      break;
    case 'CASH_ADJUSTMENT':
      headline = <MoneyText value={d.delta} variant="display" signed testID="details-amount" />;
      body = <Line label="סוג">{d.delta.minor < 0 ? 'חסר מזומן' : 'נמצא מזומן נוסף'}</Line>;
      break;
    case 'OPENING_BALANCE':
      headline = <MoneyText value={d.amount} variant="display" testID="details-amount" />;
      body = (
        <AppText variant="caption" color={colors.inkMuted}>
          יתרת פתיחה נערכת דרך הגדרות הטיול.
        </AppText>
      );
      break;
  }

  return (
    <Screen
      testID="screen-actiondetails"
      footer={
        deleted ? undefined : (
          <Row>
            <View style={{ flex: 1 }}>
              <Button label={he.common.edit} icon="pencil-outline" tone="secondary" onPress={edit} testID="details-edit" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={he.common.delete} icon="trash-can-outline" tone="danger" onPress={confirmDelete} testID="details-delete" />
            </View>
          </Row>
        )
      }>
      <Row justify="space-between">
        <AppText variant="label" color={colors.inkMuted}>
          {he.types[d.type]}
        </AppText>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="סגירה" hitSlop={12} testID="details-close">
          <Icon name="close" color={colors.inkMuted} />
        </Pressable>
      </Row>
      {headline}
      <AppText color={colors.inkMuted}>{`${formatDate(d.occurredLocalDate)} · ${localTimeOf(d)}`}</AppText>
      {deleted ? <Banner tone="warning" title="הפעולה נמחקה" body="היא לא משפיעה על יתרות, יומן או סיכומים." testID="details-deleted" /> : null}

      <Card>
        {body}
        {d.description ? <Line label="תיאור">{d.description}</Line> : null}
        {d.place ? <Line label="מקום">{d.place}</Line> : null}
        {d.note ? <Line label="הערה">{d.note}</Line> : null}
      </Card>

      {tx.cardCharge && !deleted ? <CardChargeSection key={`${tx.id}-${tx.revision}`} id={tx.id} charge={tx.cardCharge} onSaved={notifyChanged} /> : null}
      {!deleted && d.type !== 'OPENING_BALANCE' ? <ReceiptSection transactionId={tx.id} /> : null}

      <SectionTitle title="היסטוריית שינויים" />
      <Card testID="details-history">
        {history.map((h, i) => (
          <Row key={i} justify="space-between" style={{ paddingVertical: space.xs }}>
            <AppText variant="label">{HISTORY_TEXT[h.action] ?? h.action}</AppText>
            <AppText variant="caption" color={colors.inkMuted}>{`${formatDate(localDateOf(h.changedAt, data.offset))} · ${localTimeOf({ occurredAt: h.changedAt, occurredLocalDate: '', tzOffsetMin: data.offset })}`}</AppText>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
