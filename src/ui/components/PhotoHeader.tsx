import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, headerOverlap, space } from '../theme/tokens';
import { Icon, type IconName } from './primitives';

// CC0 photo (Ko Phi Phi Le, by Renek78, Wikimedia Commons) — see docs/ui/ASSETS.md.
const PHOTO = require('../../../assets/images/travel-header.jpg');

/** Round translucent icon button placed on the photo (back, settings, share…). */
export function HeaderButton({ icon, label, onPress, testID, directional }: { icon: IconName; label: string; onPress: () => void; testID?: string; directional?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} hitSlop={8} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={24} color={colors.ink} directional={directional} />
    </Pressable>
  );
}

/**
 * Approved travel-photo header: photo, soft dark overlay, centered white title lines. The screen
 * body overlaps its bottom edge with a rounded top (see `Screen`'s `header` prop).
 */
export function PhotoHeader(props: {
  title: string;
  subtitle?: string;
  caption?: string;
  /** Visual right side in RTL (start). */
  start?: ReactNode;
  /** Visual left side in RTL (end). */
  end?: ReactNode;
  compact?: boolean;
  strong?: boolean;
  onTitlePress?: () => void;
  titleTestID?: string;
}) {
  const insets = useSafeAreaInsets();
  const titleBlock = (
    <View style={styles.titles}>
      <Text style={styles.title} numberOfLines={1}>
        {props.title}
      </Text>
      {props.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {props.subtitle}
        </Text>
      ) : null}
      {props.caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {props.caption}
        </Text>
      ) : null}
    </View>
  );
  return (
    <ImageBackground source={PHOTO} resizeMode="cover" style={{ paddingTop: insets.top + space.sm, paddingBottom: headerOverlap + (props.compact ? space.md : space.xl) }}>
      <StatusBar style="light" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: props.strong ? colors.headerOverlayStrong : colors.headerOverlay }]} />
      <View style={styles.row}>
        <View style={styles.side}>{props.start}</View>
        {props.onTitlePress ? (
          <Pressable onPress={props.onTitlePress} accessibilityRole="button" accessibilityLabel={`${props.title}. החלפת טיול`} style={styles.flex} testID={props.titleTestID}>
            {titleBlock}
          </Pressable>
        ) : (
          <View style={styles.flex} testID={props.titleTestID}>
            {titleBlock}
          </View>
        )}
        <View style={[styles.side, styles.sideEnd]}>{props.end}</View>
      </View>
    </ImageBackground>
  );
}

const shadowText = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } } as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.lg, minHeight: 56 },
  side: { width: 52, alignItems: 'flex-start' },
  sideEnd: { alignItems: 'flex-end' },
  flex: { flex: 1 },
  titles: { alignItems: 'center', gap: 2, paddingTop: space.xs },
  title: { color: '#fff', fontSize: 28, lineHeight: 36, fontWeight: '800', textAlign: 'center', ...shadowText },
  subtitle: { color: '#fff', fontSize: 17, lineHeight: 24, fontWeight: '600', textAlign: 'center', ...shadowText },
  caption: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '500', textAlign: 'center', ...shadowText },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
});
