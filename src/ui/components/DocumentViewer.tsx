import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PixelRatio, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TripDocumentView, ViewerContent } from '../../application/documents/DocumentService';
import { useApp } from '../AppContext';
import { ltr } from '../format';
import { colors, radius, rtlRoot, space } from '../theme/tokens';
import { bounds, clamp, clampScale, layoutPages, MAX_SCALE, MIN_SCALE, PAGE_GAP, TAP_SCALE, visiblePages, zoomAround } from '../viewer/zoom';
import { AppText, Button, Icon } from './primitives';

type Size = { width: number; height: number };
type State = { status: 'loading' } | { status: 'ready'; content: ViewerContent } | { status: 'missing' } | { status: 'unavailable' } | { status: 'error' };

/** Render resolution: twice the screen's pixel width keeps text sharp while zoomed (capped for memory). */
const pdfWidthPx = (viewW: number) => Math.min(2400, Math.round(PixelRatio.getPixelSizeForLayoutSize(viewW) * 2));
const imageMaxPx = (view: Size) => Math.min(3072, Math.round(PixelRatio.getPixelSizeForLayoutSize(Math.max(view.width, view.height)) * 1.5));

/**
 * Pinch-to-zoom (1×–5×, around the fingers), one-finger pan with momentum, double tap to zoom in/out.
 * At 1× the pages scroll vertically like a normal list. Gestures and transforms run on the UI thread.
 */
function ZoomablePages(props: { view: Size; pages: readonly Size[]; uriOf: (i: number) => string | undefined; onRange: (first: number, last: number, current: number) => void }) {
  const { view, pages, uriOf, onRange } = props;
  const { tops, heights, total } = useMemo(() => layoutPages(pages, view.width), [pages, view.width]);
  const vw = view.width;
  const vh = view.height;
  const start = bounds(1, vw, vh, vw, total);
  const s = useSharedValue(1);
  const tx = useSharedValue(start.maxX);
  const ty = useSharedValue(start.maxY);
  const origin = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
  // Set by a pinch and kept until the next touch sequence, so the pan ending with it adds no fling.
  const pinched = useSharedValue(false);

  const [range, setRange] = useState<[number, number]>([0, 0]);
  const reportRange = useCallback(
    (first: number, last: number, current: number) => {
      setRange([first, last]);
      onRange(first, last, current);
    },
    [onRange],
  );

  const gesture = useMemo(() => {
    const settle = () => {
      'worklet';
      const s1 = clampScale(s.value);
      const t = zoomAround(s.value, tx.value, ty.value, s1, vw / 2, vh / 2, vw / 2, vh / 2);
      const b = bounds(s1, vw, vh, vw, total);
      s.value = withTiming(s1, { duration: 180 });
      tx.value = withTiming(clamp(t.x, b.minX, b.maxX), { duration: 180 });
      ty.value = withTiming(clamp(t.y, b.minY, b.maxY), { duration: 180 });
    };

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        cancelAnimation(s);
        cancelAnimation(tx);
        cancelAnimation(ty);
        pinched.value = true;
        origin.value = { s: s.value, x: tx.value, y: ty.value, fx: e.focalX, fy: e.focalY };
      })
      .onUpdate((e) => {
        const o = origin.value;
        // A little give beyond the limits while pinching; `settle` springs back.
        const s1 = clamp(o.s * e.scale, MIN_SCALE * 0.8, MAX_SCALE * 1.2);
        const t = zoomAround(o.s, o.x, o.y, s1, o.fx, o.fy, e.focalX, e.focalY);
        s.value = s1;
        tx.value = t.x;
        ty.value = t.y;
      })
      .onEnd(() => settle());

    const pan = Gesture.Pan()
      .averageTouches(true)
      .onBegin(() => {
        pinched.value = false;
      })
      .onStart(() => {
        cancelAnimation(tx);
        cancelAnimation(ty);
      })
      .onChange((e) => {
        if (pinched.value) return;
        const b = bounds(s.value, vw, vh, vw, total);
        tx.value = clamp(tx.value + e.changeX, b.minX, b.maxX);
        ty.value = clamp(ty.value + e.changeY, b.minY, b.maxY);
      })
      .onEnd((e) => {
        if (pinched.value) return;
        const b = bounds(s.value, vw, vh, vw, total);
        tx.value = withDecay({ velocity: e.velocityX, clamp: [b.minX, b.maxX] });
        ty.value = withDecay({ velocity: e.velocityY, clamp: [b.minY, b.maxY] });
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e, success) => {
        if (!success) return;
        const target = s.value > MIN_SCALE + 0.05 ? MIN_SCALE : TAP_SCALE;
        const t = zoomAround(s.value, tx.value, ty.value, target, e.x, e.y, e.x, e.y);
        const b = bounds(target, vw, vh, vw, total);
        s.value = withTiming(target, { duration: 220 });
        tx.value = withTiming(clamp(t.x, b.minX, b.maxX), { duration: 220 });
        ty.value = withTiming(clamp(t.y, b.minY, b.maxY), { duration: 220 });
      });
    return Gesture.Simultaneous(pinch, pan, doubleTap);
    // Shared values are stable; the geometry is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw, vh, total]);

  useAnimatedReaction(
    () => visiblePages(tops, heights, s.value, ty.value, vh),
    (cur, prev) => {
      // Visible-page tracking drives both rendering and which page images stay mounted (memory bound).
      if (!prev || cur[0] !== prev[0] || cur[1] !== prev[1] || cur[2] !== prev[2]) runOnJS(reportRange)(cur[0], cur[1], cur[2]);
    },
    [tops, heights, vh, reportRange],
  );

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.viewport} collapsable={false} testID="document-viewer-pages">
        <Animated.View style={[styles.content, { width: vw, height: total }, style]}>
          {pages.map((p, i) => {
            const uri = i >= range[0] - 1 && i <= range[1] + 1 ? uriOf(i) : undefined;
            return (
              <View key={i} style={[styles.page, { top: tops[i], height: heights[i] }]} testID={`document-page-${i}`}>
                {/* resizeMethod "scale": decode at full render resolution — the default resizes local files to the layout size, which blurs when zoomed. */}
                {uri ? <Image source={{ uri }} style={styles.fill} resizeMode="contain" resizeMethod="scale" accessibilityLabel={`עמוד ${i + 1}`} /> : <ActivityIndicator color={colors.inkFaint} />}
              </View>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Full-screen, offline document viewer for PDFs and images (renders via the native module). */
export function DocumentViewer({ tripId, doc, onClose, onShare }: { tripId: number; doc: TripDocumentView; onClose: () => void; onShare: () => void }) {
  const { services } = useApp();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<Size | null>(null);
  const [available] = useState(() => services.documentService.viewerAvailable());
  const [state, setState] = useState<State>(available ? { status: 'loading' } : { status: 'unavailable' });
  const [rendered, setRendered] = useState<Record<number, string>>({});
  const [failedPages, setFailedPages] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [current, setCurrent] = useState(0);
  const inflight = useRef(new Set<number>());

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (!view || view.width !== width || view.height !== height)) setView({ width, height });
  };

  useEffect(() => {
    if (!view || !available) return;
    let alive = true;
    services.documentService
      .openForViewing(tripId, doc.id, imageMaxPx(view))
      .then((c) => alive && setState(c === 'missing' ? { status: 'missing' } : { status: 'ready', content: c }))
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
    // Re-open only for another document (the viewport size is fixed while the viewer is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, view !== null]);

  // Lazily render the visible PDF pages and their neighbours.
  const content = state.status === 'ready' ? state.content : null;
  useEffect(() => {
    if (content?.kind !== 'pdf' || !view || range[0] < 0) return;
    const width = pdfWidthPx(view.width);
    for (let i = Math.max(0, range[0] - 1); i <= Math.min(content.pages.length - 1, range[1] + 1); i++) {
      if (rendered[i] || inflight.current.has(i)) continue;
      inflight.current.add(i);
      const page = i;
      services.documentService
        .renderPdfPage(tripId, doc.id, page, width)
        .then((p) => setRendered((r) => ({ ...r, [page]: p.uri })))
        .catch(() => setFailedPages((n) => n + 1))
        .finally(() => inflight.current.delete(page));
    }
  }, [content, range, rendered, view, services, tripId, doc.id]);

  const pages: Size[] | null = useMemo(() => (content ? (content.kind === 'pdf' ? content.pages : [content.page]) : null), [content]);
  const uriOf = useCallback((i: number) => (content?.kind === 'image' ? content.page.uri : rendered[i]), [content, rendered]);
  const onRange = useCallback((first: number, last: number, cur: number) => {
    setRange([first, last]);
    setCurrent(cur);
  }, []);

  const message =
    state.status === 'missing'
      ? 'הקובץ לא נמצא במכשיר. ייתכן שנתוני האפליקציה נוקו.'
      : state.status === 'unavailable'
        ? 'אי אפשר להציג את המסמך כאן. אפשר לשתף אותו לאפליקציה אחרת.'
        : state.status === 'error' || failedPages > 0
          ? 'לא ניתן להציג את הקובץ. ייתכן שהוא פגום או מוגן בסיסמה. אפשר לשתף אותו לאפליקציה אחרת.'
          : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={[rtlRoot, styles.root]}>
        <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה" hitSlop={10} testID="document-viewer-close" style={styles.barButton}>
            <Icon name="close" color="#fff" size={26} />
          </Pressable>
          <AppText variant="heading" color="#fff" numberOfLines={1} style={styles.title}>
            {doc.displayName}
          </AppText>
          <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="שיתוף" hitSlop={10} testID="document-viewer-share" style={styles.barButton}>
            <Icon name="share-variant-outline" color="#fff" size={24} />
          </Pressable>
        </View>
        <View style={styles.flex} onLayout={onLayout} testID="document-viewer">
          {view && pages && !message ? <ZoomablePages view={view} pages={pages} uriOf={uriOf} onRange={onRange} /> : null}
          {state.status === 'loading' ? <ActivityIndicator style={styles.center} color="#fff" size="large" testID="document-viewer-loading" /> : null}
          {message ? (
            <View style={styles.center} testID="document-viewer-message">
              <Icon name="file-alert-outline" color="#fff" size={44} />
              <AppText color="#fff" center>
                {message}
              </AppText>
              {state.status !== 'missing' ? <Button compact tone="soft" icon="share-variant-outline" label="שיתוף" onPress={onShare} testID="document-viewer-share-fallback" /> : null}
            </View>
          ) : null}
        </View>
        {content?.kind === 'pdf' && range[0] >= 0 && !message ? (
          <View style={[styles.pager, { bottom: insets.bottom + space.lg }]} pointerEvents="none">
            <AppText variant="label" color="#fff" testID="document-viewer-page">{`עמוד ${ltr(`${Math.max(0, current) + 1} / ${content.pages.length}`)}`}</AppText>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#1B1F27' },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, backgroundColor: '#11141A' },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  viewport: { flex: 1, overflow: 'hidden', direction: 'ltr' },
  content: { position: 'absolute', left: 0, top: 0, transformOrigin: [0, 0, 0] },
  page: { position: 'absolute', left: PAGE_GAP, right: PAGE_GAP, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  pager: { position: 'absolute', alignSelf: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
});
