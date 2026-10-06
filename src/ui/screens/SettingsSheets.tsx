import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CardError, type CardInput } from '../../application/cards/CardService';
import { CategoryError } from '../../application/expenses/CategoryService';
import type { Card as CardModel } from '../../application/ports/CardRepository';
import { CARD_ISSUERS, type CardIssuerCode } from '../../domain/card';
import { CATEGORY_ICONS, type Category } from '../../domain/expense';
import { useApp } from '../AppContext';
import { CurrencyButton, CurrencyPicker } from '../components/pickers';
import { AppText, Banner, Button, Chip, Field, Icon, Row } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { categoryLabel, he } from '../i18n/he';
import { categoryIcon } from '../present';
import { colors, space } from '../theme/tokens';

type FeeChoice = 'UNKNOWN' | 'NO_FOREIGN_FEE' | 'FEE_PERCENT';

/** Add/edit one card. Identity only — no number, CVV, expiry or last four digits are ever asked. */
export function CardSheet({ card, onClose }: { card: CardModel | null; onClose: () => void }) {
  const { services, notifyChanged } = useApp();
  const initialFee: FeeChoice = card?.classification.startsWith('FEE_PERCENT:') ? 'FEE_PERCENT' : ((card?.classification as FeeChoice | undefined) ?? 'UNKNOWN');
  const [issuer, setIssuer] = useState<CardIssuerCode>(card?.issuer ?? 'ISRACARD');
  const [nickname, setNickname] = useState(card?.nickname ?? '');
  const [fee, setFee] = useState<FeeChoice>(initialFee);
  const [percent, setPercent] = useState(card?.classification.startsWith('FEE_PERCENT:') ? card.classification.slice(12) : '');
  const [billing, setBilling] = useState(card?.billingCurrency ?? 'ILS');
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const classification = fee === 'FEE_PERCENT' ? `FEE_PERCENT:${percent.trim().replace(',', '.')}` : fee;
    const input: CardInput = { issuer, nickname: nickname.trim() || null, classification, billingCurrency: billing };
    try {
      if (card) services.cardService.update(card.id, input);
      else services.cardService.create(input);
      notifyChanged();
      onClose();
    } catch (e) {
      setError(e instanceof CardError && e.code === 'INVALID_CLASSIFICATION' ? 'אחוז עמלה לא תקין (בין 0.01 ל-10, עד 2 ספרות אחרי הנקודה)' : 'השמירה נכשלה');
    }
  };

  const archive = () =>
    Alert.alert('הסרת כרטיס', 'הכרטיס לא יוצע יותר לפעולות חדשות. פעולות קיימות לא משתנות.', [
      { text: he.common.cancel, style: 'cancel' },
      {
        text: 'הסרה',
        style: 'destructive',
        onPress: () => {
          services.cardService.archive(card!.id);
          notifyChanged();
          onClose();
        },
      },
    ]);

  return (
    <Sheet visible title={card ? 'עריכת כרטיס' : 'כרטיס חדש'} onClose={onClose} testID="card-sheet">
      {error ? <Banner tone="danger" title={error} /> : null}
      <AppText variant="label" color={colors.inkMuted}>
        חברת האשראי
      </AppText>
      <Row wrap>
        {CARD_ISSUERS.map((i) => (
          <Chip key={i} label={he.issuers[i] ?? i} selected={issuer === i} onPress={() => setIssuer(i)} testID={`issuer-${i}`} />
        ))}
      </Row>
      <Field label={`כינוי (${he.common.optional})`} value={nickname} onChangeText={setNickname} maxLength={30} placeholder="למשל: הכרטיס של דנה" testID="card-nickname" />
      <AppText variant="label" color={colors.inkMuted}>
        עמלה על עסקאות במטבע חוץ
      </AppText>
      <Row wrap>
        <Chip label="לא יודע/ת" selected={fee === 'UNKNOWN'} onPress={() => setFee('UNKNOWN')} testID="fee-UNKNOWN" />
        <Chip label="אין עמלה" selected={fee === 'NO_FOREIGN_FEE'} onPress={() => setFee('NO_FOREIGN_FEE')} testID="fee-NO_FOREIGN_FEE" />
        <Chip label="יש עמלה (%)" selected={fee === 'FEE_PERCENT'} onPress={() => setFee('FEE_PERCENT')} testID="fee-FEE_PERCENT" />
      </Row>
      {fee === 'FEE_PERCENT' ? <Field label="אחוז העמלה לפי תנאי הכרטיס" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" ltrInput placeholder="למשל 3" testID="card-fee-percent" /> : null}
      <AppText variant="caption" color={colors.inkMuted}>
        משמש רק להערכת החיוב. אם לא ידוע — ההערכה תוצג ללא עמלות, וניתן להזין חיוב בפועל בכל פעולה.
      </AppText>
      <Row>
        <AppText variant="label" color={colors.inkMuted}>
          מטבע החיוב
        </AppText>
        <CurrencyButton code={billing} onPress={() => setPicker(true)} testID="card-billing" />
      </Row>
      <Button label={he.common.save} icon="check" onPress={save} testID="card-save" />
      {card ? <Button label="הסרת הכרטיס" tone="ghost" icon="archive-outline" onPress={archive} testID="card-archive" /> : null}
      <CurrencyPicker visible={picker} selected={billing} suggested={['ILS', 'USD', 'EUR']} onClose={() => setPicker(false)} onSelect={(c) => { setBilling(c); setPicker(false); }} />
    </Sheet>
  );
}

/** Custom categories: create, rename, delete (expenses are reassigned, default "Other"). */
export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const { services, notifyChanged } = useApp();
  const [list, setList] = useState<Category[]>(() => services.categoryService.list());
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('tag');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    setList(services.categoryService.list());
    notifyChanged();
  };

  const startEdit = (c: Category | 'new') => {
    setEditing(c);
    setName(c === 'new' ? '' : (c.name ?? ''));
    setIcon(c === 'new' ? 'tag' : c.icon);
    setError(null);
  };

  const save = () => {
    try {
      if (editing === 'new') services.categoryService.createCustom(name, icon);
      else if (editing) services.categoryService.renameCustom(editing.id, name, icon);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof CategoryError && e.violations.includes('DUPLICATE_NAME') ? 'כבר קיימת קטגוריה בשם הזה' : 'שם לא תקין (1–40 תווים)');
    }
  };

  const remove = (c: Category) => {
    const used = services.categoryService.usageCount(c.id);
    Alert.alert('מחיקת קטגוריה', used ? `${used} הוצאות בקטגוריה יועברו ל"אחר". השינוי נשמר בהיסטוריה של כל הוצאה.` : 'הקטגוריה תימחק.', [
      { text: he.common.cancel, style: 'cancel' },
      {
        text: he.common.delete,
        style: 'destructive',
        onPress: () => {
          services.categoryService.deleteCustom(c.id);
          refresh();
        },
      },
    ]);
  };

  return (
    <Sheet visible title="קטגוריות" onClose={onClose} testID="categories-sheet">
      {list.map((c) => (
        <Row key={c.id} justify="space-between" style={{ minHeight: 44 }}>
          <Row>
            <Icon name={categoryIcon(c.icon)} color={colors.primary} />
            <AppText>{categoryLabel(c)}</AppText>
          </Row>
          {c.builtinKey ? (
            <AppText variant="caption" color={colors.inkFaint}>
              מובנית
            </AppText>
          ) : (
            <Row>
              <Pressable onPress={() => startEdit(c)} accessibilityRole="button" accessibilityLabel={`עריכת ${categoryLabel(c)}`} hitSlop={10} testID={`cat-edit-${c.id}`}>
                <Icon name="pencil-outline" color={colors.inkMuted} />
              </Pressable>
              <Pressable onPress={() => remove(c)} accessibilityRole="button" accessibilityLabel={`מחיקת ${categoryLabel(c)}`} hitSlop={10} testID={`cat-delete-${c.id}`}>
                <Icon name="trash-can-outline" color={colors.inkMuted} />
              </Pressable>
            </Row>
          )}
        </Row>
      ))}
      {editing ? (
        <View style={{ gap: space.sm }}>
          {error ? <Banner tone="danger" title={error} /> : null}
          <Field label="שם הקטגוריה" value={name} onChangeText={setName} maxLength={40} testID="cat-name" />
          <Row wrap>
            {CATEGORY_ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} accessibilityRole="button" accessibilityState={{ selected: icon === i }} style={{ padding: 8, borderRadius: 20, backgroundColor: icon === i ? colors.primarySoft : 'transparent' }} testID={`cat-icon-${i}`}>
                <Icon name={categoryIcon(i)} color={colors.primary} />
              </Pressable>
            ))}
          </Row>
          <Button label={he.common.save} icon="check" onPress={save} testID="cat-save" />
        </View>
      ) : (
        <Button label="קטגוריה חדשה" icon="plus" tone="secondary" onPress={() => startEdit('new')} testID="cat-new" />
      )}
    </Sheet>
  );
}
