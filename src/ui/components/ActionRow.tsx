import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { JournalRow } from '../../application/ports/JournalQueries';
import type { Category } from '../../domain/expense';
import { presentAction } from '../present';
import { colors, space } from '../theme/tokens';
import { AppText, Icon, IconTile, Row } from './primitives';

/** One transaction in a list (approved row: icon tile, title/subtitle, amount + currency); opens Action Details. */
export function ActionRow({ row, categories, today, last }: { row: JournalRow; categories: ReadonlyMap<number, Category>; today?: string; last?: boolean }) {
  const p = presentAction(row, categories, today);
  return (
    <Pressable
      onPress={() => router.push(`/action/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${p.amountText}`}
      testID={`action-${row.id}`}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { opacity: 0.7 }]}>
      <IconTile icon={p.icon} color={p.iconColor} />
      <View style={styles.text}>
        <AppText numberOfLines={1} style={styles.title}>
          {p.title}
        </AppText>
        {p.subtitle ? (
          <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {p.subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.amount}>
        <Row gap={4}>
          {row.hasReceipt ? <Icon name="paperclip" size={14} color={colors.inkFaint} /> : null}
          <AppText variant="heading" color={p.amountColor}>
            {p.amountText}
          </AppText>
        </Row>
        {p.amountCaption ? (
          <AppText variant="caption" color={colors.inkMuted}>
            {p.amountCaption}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, minHeight: 64 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '600' },
  amount: { alignItems: 'flex-end' },
});
