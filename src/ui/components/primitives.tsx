import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Money } from '../../domain/money';
import { formatMoney } from '../format';
import { colors, radius, space, touch, type } from '../theme/tokens';

type Variant = keyof typeof type;

export function AppText(props: {
  children: ReactNode;
  variant?: Variant;
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  const { variant = 'body', color = colors.ink, center, style, ...rest } = props;
  return <Text {...rest} style={[type[variant], styles.text, { color }, center && styles.center, style]} />;
}

export function MoneyText(props: { value: Money; variant?: Variant; signed?: boolean; tone?: 'auto' | 'plain'; color?: string; testID?: string }) {
  const negative = props.value.minor < 0 && props.tone !== 'plain';
  return (
    <AppText variant={props.variant ?? 'body'} color={negative ? colors.danger : (props.color ?? colors.ink)} testID={props.testID}>
      {formatMoney(props.value, { signed: props.signed })}
    </AppText>
  );
}

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Directional icons (arrows/chevrons) use LTR names ("chevron-right" = forward) and are mirrored: the app is RTL-only. */
export function Icon({ name, size = 22, color = colors.ink, directional }: { name: IconName; size?: number; color?: ColorValue; directional?: boolean }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      style={directional ? styles.mirrored : undefined}
    />
  );
}

export function Screen(props: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode; testID?: string }) {
  const { scroll = true, padded = true } = props;
  const insets = useSafeAreaInsets();
  const content = <View style={[padded && styles.padded, styles.gap]}>{props.children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID={props.testID}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{content}</View>
      )}
      {props.footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{props.footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card(props: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  if (props.onPress) {
    return (
      <Pressable
        onPress={props.onPress}
        testID={props.testID}
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, props.style]}>
        {props.children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, props.style]} testID={props.testID}>
      {props.children}
    </View>
  );
}

export function Row(props: { children: ReactNode; gap?: number; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { flexDirection: 'row', gap: props.gap ?? space.sm, alignItems: props.align ?? 'center', justifyContent: props.justify, flexWrap: props.wrap ? 'wrap' : 'nowrap' },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button(props: { label: string; onPress: () => void; tone?: ButtonTone; icon?: IconName; disabled?: boolean; busy?: boolean; testID?: string; compact?: boolean }) {
  const tone = props.tone ?? 'primary';
  const fg = tone === 'primary' || tone === 'danger' ? colors.primaryInk : tone === 'ghost' ? colors.primary : colors.ink;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.busy}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => [
        styles.button,
        props.compact && styles.buttonCompact,
        styles[`button_${tone}`],
        (props.disabled || props.busy) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {props.busy ? <ActivityIndicator color={fg} /> : props.icon ? <Icon name={props.icon} size={20} color={fg} /> : null}
      <AppText variant="heading" color={fg}>
        {props.label}
      </AppText>
    </Pressable>
  );
}

export function Chip(props: { label: string; selected?: boolean; onPress: () => void; icon?: IconName; testID?: string; tone?: 'default' | 'danger' }) {
  const fg = props.selected ? colors.primaryInk : colors.ink;
  return (
    <Pressable
      onPress={props.onPress}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.selected }}
      accessibilityLabel={props.label}
      style={({ pressed }) => [styles.chip, props.selected && styles.chipSelected, pressed && styles.pressed]}>
      {props.icon ? <Icon name={props.icon} size={18} color={fg} /> : null}
      <AppText variant="label" color={fg}>
        {props.label}
      </AppText>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string | null; ltrInput?: boolean }) {
  const { label, hint, error, ltrInput, style, ...input } = props;
  return (
    <View style={styles.field}>
      <AppText variant="label" color={colors.inkMuted}>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...input}
        style={[styles.input, ltrInput ? styles.inputLtr : styles.inputRtl, error ? styles.inputError : null, style]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.inkMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Banner(props: { tone: 'warning' | 'danger' | 'info'; title: string; body?: string; children?: ReactNode; testID?: string }) {
  const bg = props.tone === 'danger' ? colors.dangerSoft : props.tone === 'warning' ? colors.warningSoft : colors.primarySoft;
  const fg = props.tone === 'danger' ? colors.danger : props.tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} testID={props.testID} accessibilityRole="alert">
      <Row align="flex-start">
        <Icon name={props.tone === 'info' ? 'information-outline' : 'alert-circle-outline'} color={fg} />
        <View style={styles.flex}>
          <AppText variant="heading" color={fg}>
            {props.title}
          </AppText>
          {props.body ? <AppText variant="label" color={colors.ink}>{props.body}</AppText> : null}
        </View>
      </Row>
      {props.children}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row justify="space-between" style={styles.section}>
      <AppText variant="heading">{title}</AppText>
      {action}
    </Row>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} color={colors.inkFaint} />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {body ? (
        <AppText variant="label" color={colors.inkMuted} center>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'left', writingDirection: 'rtl' },
  mirrored: { transform: [{ scaleX: -1 }] },
  center: { textAlign: 'center' },
  screen: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { paddingBottom: space.xxl },
  padded: { padding: space.lg },
  gap: { gap: space.md },
  flex: { flex: 1 },
  footer: { padding: space.lg, paddingTop: space.sm, backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  pressed: { opacity: 0.7 },
  button: { minHeight: touch, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonCompact: { minHeight: 40, paddingHorizontal: space.md },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.surfaceMuted },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  field: { gap: space.xs },
  input: { minHeight: touch, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: space.md, fontSize: 16, color: colors.ink },
  inputRtl: { textAlign: 'right', writingDirection: 'rtl' },
  inputLtr: { textAlign: 'left', writingDirection: 'ltr' },
  inputError: { borderColor: colors.danger },
  banner: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  section: { marginTop: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
});
