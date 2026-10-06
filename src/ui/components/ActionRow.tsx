import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { JournalRow } from '../../application/ports/JournalQueries';
import type { Category } from '../../domain/expense';
import { presentAction } from '../present';
import { colors, radius, space } from '../theme/tokens';
import { AppText, Icon, Row } from './primitives';

/** One transaction in a list; opens Action Details. */
export function ActionRow({ row, categories }: { row: JournalRow; categories: ReadonlyMap<number, Category> }) {
  const p = presentAction(row, categories);
  return (
    <Pressable
      onPress={() => router.push(`/action/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${p.amountText}`}
      testID={`action-${row.id}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.icon, { backgroundColor: `${p.iconColor}1A` }]}>
        <Icon name={p.icon} color={p.iconColor} size={20} />
      </View>
      <View style={styles.text}>
        <AppText numberOfLines={1}>{p.title}</AppText>
        {p.subtitle ? (
          <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {p.subtitle}
          </AppText>
        ) : null}
      </View>
      <Row gap={4}>
        {row.hasReceipt ? <Icon name="paperclip" size={16} color={colors.inkFaint} /> : null}
        <AppText variant="label" color={p.amountColor}>
          {p.amountText}
        </AppText>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 56, borderRadius: radius.sm },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
