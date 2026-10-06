import { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useApp, useQuery } from '../AppContext';
import { colors, radius, rtlRoot, space } from '../theme/tokens';
import { AppText, Button, Card, Icon, Row } from './primitives';

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
      <AppText variant="heading">קבלה</AppText>
      {uri ? (
        <>
          <Pressable onPress={() => setPreview(true)} accessibilityRole="imagebutton" accessibilityLabel="הצגת הקבלה" testID="receipt-thumb">
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
          </Pressable>
          <Row>
            <View style={{ flex: 1 }}>
              <Button compact tone="secondary" icon="camera-retake-outline" label="החלפה" onPress={capture} busy={busy} testID="receipt-replace" />
            </View>
            <View style={{ flex: 1 }}>
              <Button compact tone="ghost" icon="trash-can-outline" label="מחיקה" onPress={remove} testID="receipt-delete" />
            </View>
          </Row>
          {preview ? <ReceiptPreview uri={uri} onClose={() => setPreview(false)} /> : null}
        </>
      ) : (
        <Button compact tone="secondary" icon="camera-outline" label="צילום קבלה" onPress={capture} busy={busy} testID="receipt-capture" />
      )}
      <AppText variant="caption" color={colors.inkMuted}>
        התמונה נשמרת רק באפליקציה, במכשיר הזה.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 180, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  preview: { backgroundColor: '#000', justifyContent: 'center' },
  full: { flex: 1 },
  close: { position: 'absolute', top: space.xxl + space.lg, left: space.lg, padding: space.sm },
});
