import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DocumentImportError, type DocumentImportErrorCode, type TripDocumentView } from '../../application/documents/DocumentService';
import { localTimeOf } from '../../domain/time';
import { useApp, useQuery } from '../AppContext';
import { DocumentViewer } from '../components/DocumentViewer';
import { PhotoHeader } from '../components/PhotoHeader';
import { AppText, Button, Card, EmptyState, Field, Icon, IconTile, Row, Screen } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { formatDateNumeric, formatFileSize, ltr } from '../format';
import { he } from '../i18n/he';
import { colors, space, touch } from '../theme/tokens';

const IMPORT_ERRORS: Record<DocumentImportErrorCode, [string, string]> = {
  UNSUPPORTED: ['סוג הקובץ אינו נתמך', 'אפשר לייבא קובץ PDF או תמונה (JPG, PNG, HEIC).'],
  EMPTY: ['הקובץ ריק', 'בחרו קובץ אחר.'],
  TOO_LARGE: ['הקובץ גדול מדי', 'אפשר לייבא קבצים עד 50MB.'],
  NO_SPACE: ['אין מספיק מקום במכשיר', 'פנו מקום באחסון ונסו שוב.'],
  COPY_FAILED: ['המסמך לא נשמר', 'לא ניתן היה להעתיק את הקובץ. נסו שוב.'],
};

const TYPE_LABEL: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/heic': 'HEIC' };

function DocumentRow({ doc, last, onOpen, onMore }: { doc: TripDocumentView; last: boolean; onOpen: () => void; onMore: () => void }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`פתיחת ${doc.displayName}`}
        testID={`document-${doc.id}`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <IconTile icon={doc.isImage ? 'file-image-outline' : 'file-pdf-box'} color={doc.isImage ? colors.primary : colors.danger} />
        <View style={styles.flex}>
          <AppText style={styles.name} numberOfLines={2}>
            {doc.displayName}
          </AppText>
          {doc.available ? (
            <AppText variant="caption" color={colors.inkMuted}>
              {`${ltr(TYPE_LABEL[doc.mimeType] ?? '')} · ${formatFileSize(doc.sizeBytes)} · ${formatDateNumeric(doc.createdLocalDate)}`}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.danger} testID={`document-missing-${doc.id}`}>
              הקובץ חסר במכשיר
            </AppText>
          )}
        </View>
      </Pressable>
      <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={`פעולות עבור ${doc.displayName}`} hitSlop={6} testID={`document-more-${doc.id}`} style={styles.more}>
        <Icon name="dots-vertical" color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

function ActionRow({ icon, label, onPress, testID, danger }: { icon: 'eye-outline' | 'pencil-outline' | 'share-variant-outline' | 'trash-can-outline'; label: string; onPress: () => void; testID: string; danger?: boolean }) {
  const color = danger ? colors.danger : colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={danger ? colors.danger : colors.primary} />
      <AppText color={color}>{label}</AppText>
    </Pressable>
  );
}

/** Trip documents: tickets, bookings, insurance… kept privately on the device, available offline (ADR-0013). */
export function DocumentsScreen() {
  const { services, notifyChanged } = useApp();
  const data = useQuery((s) => {
    const trip = s.tripService.currentTrip();
    return trip ? { trip, docs: s.documentService.list(trip.id) } : null;
  });
  const [busy, setBusy] = useState<'pick' | 'capture' | null>(null);
  const [menu, setMenu] = useState<TripDocumentView | null>(null);
  const [renaming, setRenaming] = useState<{ doc: TripDocumentView; name: string } | null>(null);
  const [viewing, setViewing] = useState<TripDocumentView | null>(null);
  if (!data) return null;
  const { trip, docs } = data;
  const ds = services.documentService;

  const add = async (kind: 'pick' | 'capture') => {
    setBusy(kind);
    try {
      const r = kind === 'pick' ? await ds.pickFile() : await ds.capturePhoto();
      if (r.status === 'denied') Alert.alert('אין גישה למצלמה', 'כדי לצלם מסמך צריך לאשר גישה למצלמה. אפשר לאשר בהגדרות המכשיר.');
      if (r.status !== 'picked') return;
      let name: string | undefined;
      if (kind === 'capture') {
        const now = services.tripService.nowOccurrence();
        const [y, m, d] = now.occurredLocalDate.split('-');
        name = `מסמך מצולם ${d}.${m}.${y} ${localTimeOf(now)}`;
      }
      await ds.importFile(trip.id, r.uri, r.name, name);
      notifyChanged();
    } catch (e) {
      const [title, body] = e instanceof DocumentImportError ? IMPORT_ERRORS[e.code] : ['המסמך לא נשמר', 'נסו שוב.'];
      Alert.alert(title, body);
    } finally {
      setBusy(null);
    }
  };

  const open = (doc: TripDocumentView) => {
    setMenu(null);
    if (!doc.available) {
      Alert.alert('הקובץ לא נמצא', 'הקובץ של המסמך הזה כבר לא נמצא במכשיר. אפשר למחוק את הרשומה.');
      return;
    }
    setViewing(doc);
  };

  const share = async (doc: TripDocumentView) => {
    setMenu(null);
    try {
      const r = await ds.share(trip.id, doc.id);
      if (r === 'sharing_unavailable') Alert.alert('לא ניתן לשתף', 'שיתוף קבצים אינו זמין במכשיר הזה.');
      if (r === 'missing') Alert.alert('הקובץ לא נמצא', 'הקובץ של המסמך הזה כבר לא נמצא במכשיר.');
    } catch {
      Alert.alert('השיתוף נכשל', 'נסו שוב.');
    }
  };

  const remove = (doc: TripDocumentView) => {
    setMenu(null);
    Alert.alert('מחיקת מסמך', `"${doc.displayName}" יימחק מהמכשיר. לא ניתן לבטל פעולה זו.`, [
      { text: he.common.cancel, style: 'cancel' },
      {
        text: he.common.delete,
        style: 'destructive',
        onPress: () => {
          if (viewing?.id === doc.id) setViewing(null);
          ds.delete(trip.id, doc.id);
          notifyChanged();
        },
      },
    ]);
  };

  const saveRename = () => {
    if (!renaming) return;
    if (!ds.rename(trip.id, renaming.doc.id, renaming.name)) return;
    setRenaming(null);
    notifyChanged();
  };

  return (
    <Screen testID="screen-documents" header={<PhotoHeader compact title={he.tabs.documents} subtitle="כרטיסים, הזמנות ומסמכים לטיול" />}>
      <Row gap={space.md}>
        <View style={styles.flex}>
          <Button label="ייבוא קובץ" icon="file-upload-outline" onPress={() => add('pick')} busy={busy === 'pick'} disabled={busy !== null} testID="documents-import" />
        </View>
        <View style={styles.flex}>
          <Button label="צילום מסמך" tone="soft" icon="camera-outline" onPress={() => add('capture')} busy={busy === 'capture'} disabled={busy !== null} testID="documents-capture" />
        </View>
      </Row>

      {docs.length === 0 ? (
        <EmptyState icon="file-document-multiple-outline" title="אין עדיין מסמכים לטיול" body="אפשר לשמור כאן כרטיסי טיסה, הזמנות, ביטוח ועוד — קובץ PDF או תמונה." />
      ) : (
        <Card style={styles.list} testID="documents-list">
          {docs.map((d, i) => (
            <DocumentRow key={d.id} doc={d} last={i === docs.length - 1} onOpen={() => open(d)} onMore={() => setMenu(d)} />
          ))}
        </Card>
      )}
      <AppText variant="caption" color={colors.inkMuted}>
        המסמכים נשמרים רק באפליקציה, במכשיר הזה, וזמינים גם בלי אינטרנט.
      </AppText>

      <Sheet visible={menu !== null} title={menu?.displayName ?? ''} onClose={() => setMenu(null)} testID="document-actions">
        {menu ? (
          <View>
            <ActionRow icon="eye-outline" label="פתיחה" onPress={() => open(menu)} testID="document-action-open" />
            <ActionRow icon="pencil-outline" label="שינוי שם" onPress={() => (setMenu(null), setRenaming({ doc: menu, name: menu.displayName }))} testID="document-action-rename" />
            <ActionRow icon="share-variant-outline" label="שיתוף" onPress={() => share(menu)} testID="document-action-share" />
            <ActionRow icon="trash-can-outline" label="מחיקה" onPress={() => remove(menu)} testID="document-action-delete" danger />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={renaming !== null} title="שינוי שם" onClose={() => setRenaming(null)} testID="document-rename">
        {renaming ? (
          <>
            <Field label="שם המסמך" value={renaming.name} onChangeText={(name) => setRenaming({ ...renaming, name })} autoFocus maxLength={120} testID="document-rename-input" />
            <Button label={he.common.save} onPress={saveRename} disabled={!renaming.name.trim()} testID="document-rename-save" />
          </>
        ) : null}
      </Sheet>

      {viewing ? <DocumentViewer tripId={trip.id} doc={viewing} onClose={() => setViewing(null)} onShare={() => share(viewing)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: space.xs, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touch + 16 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { fontWeight: '600' },
  more: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch + 4, paddingHorizontal: space.xs },
});
