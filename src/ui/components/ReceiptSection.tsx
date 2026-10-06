import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useApp, useQuery } from '../AppContext';
import { colors, radius, rtlRoot, space } from '../theme/tokens';
import { AppText, Button, Card, Icon, SectionTitle } from './primitives';

const DENIED = 'כדי לצלם קבלה צריך לאשר גישה למצלמה. אפשר לאשר בהגדרות המכשיר.';

/** Full-screen preview of a receipt photo. */
export function ReceiptPreview({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[rtlRoot, styles.preview]} testID="receipt-preview">
        <Image source={{ uri }} style={styles.full} resizeMode="contain" accessibilityLabel="תמונת קבלה" />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה" style={styles.close} testID="receipt-preview-close">
          <Icon name="close" color="#fff" size={28} />
        </Pressable>
      </View>
    </Modal>
  );
}

/** Receipt controls in Action Details: capture, preview, replace, delete. */
export function ReceiptSection({ transactionId }: { transactionId: number }) {
  const { services, notifyChanged } = useApp();
  const uri = useQuery((s) => s.receiptService.uriFor(transactionId), [transactionId]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const capture = async () => {
    setBusy(true);
    try {
      const r = await services.receiptService.capture();
      if (r.status === 'denied') Alert.alert('אין גישה למצלמה', DENIED);
      if (r.status === 'captured') {
        await services.receiptService.attach(transactionId, r.uri);
        notifyChanged();
      }
    } catch {
      Alert.alert('הקבלה לא נשמרה', 'נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('מחיקת קבלה', 'התמונה תימחק מהמכשיר.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: () => {
          services.receiptService.remove(transactionId);
          notifyChanged();
        },
      },
    ]);

  return (
    <Card testID="receipt-section">
      <SectionTitle title="קבלה / תמונה" icon="image-outline" />
      <View style={styles.tiles}>
        {uri ? (
          <Pressable onPress={() => setPreview(true)} accessibilityRole="imagebutton" accessibilityLabel="הצגת הקבלה" testID="receipt-thumb" style={styles.tile}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
          </Pressable>
        ) : null}
        <Pressable onPress={capture} disabled={busy} accessibilityRole="button" accessibilityLabel={uri ? 'החלפת הקבלה' : 'צילום קבלה'} testID={uri ? 'receipt-replace' : 'receipt-capture'} style={({ pressed }) => [styles.tile, styles.add, pressed && { opacity: 0.7 }]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name={uri ? 'camera-retake-outline' : 'plus-circle'} color={colors.primary} size={36} />}
          <AppText variant="label" color={colors.primary} center>
            {uri ? 'החלפה' : 'הוספת תמונה'}
          </AppText>
        </Pressable>
      </View>
      {uri ? <Button compact tone="ghost" icon="trash-can-outline" label="מחיקת הקבלה" onPress={remove} testID="receipt-delete" /> : null}
      <AppText variant="caption" color={colors.inkMuted}>
        התמונה נשמרת רק באפליקציה, במכשיר הזה.
      </AppText>
      {uri && preview ? <ReceiptPreview uri={uri} onClose={() => setPreview(false)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { width: '47%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  add: { alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9DBCF7', backgroundColor: colors.surface },
  thumb: { width: '100%', height: '100%' },
  preview: { backgroundColor: '#000', justifyContent: 'center' },
  full: { flex: 1 },
  close: { position: 'absolute', top: space.xxl + space.lg, left: space.lg, padding: space.sm },
});
