import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, rtlRoot, space } from '../theme/tokens';
import { AppText, Icon, Row } from './primitives';

/** Bottom sheet for secondary flows (no extra screens, no extra dependency). */
export function Sheet(props: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[rtlRoot, styles.flex]} behavior="height">
        <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityLabel="סגירה" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} testID={props.testID}>
          <View style={styles.handle} />
          <Row justify="space-between">
            <AppText variant="title">{props.title}</AppText>
            <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="סגירה" hitSlop={12}>
              <Icon name="close" color={colors.inkMuted} />
            </Pressable>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {props.children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: space.sm, maxHeight: '88%', gap: space.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.sm },
  content: { gap: space.md, paddingBottom: space.lg },
});
