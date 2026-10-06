import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { useApp } from '../AppContext';
import { colors, space } from '../theme/tokens';
import { AppText, Button, Icon } from './primitives';

/**
 * Covers the app with a lock screen when the optional app lock is on: at cold start and after
 * returning from the background (RELOCK_AFTER_MS). Unlock uses the device's own authentication.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { services } = useApp();
  const lock = services.appLockService;
  const [locked, setLocked] = useState(() => lock.mustLock(null));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    setBusy(true);
    try {
      const r = await lock.unlock();
      if (r.unlocked) {
        setLocked(false);
        setMessage(r.result === 'unavailable' ? 'נעילת המכשיר אינה זמינה — האפליקציה נפתחה ללא אימות. אפשר לכבות את הנעילה בהגדרות.' : null);
      } else {
        setMessage(r.result === 'cancelled' ? null : 'האימות נכשל. נסו שוב.');
      }
    } finally {
      setBusy(false);
    }
  }, [lock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current !== null) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (lock.mustLock(away)) {
          setLocked(true);
          void unlock();
        }
      }
    });
    return () => sub.remove();
  }, [lock, unlock]);

  // Prompt once at cold start when locked (deferred so the lock screen renders first).
  useEffect(() => {
    if (!lock.mustLock(null)) return;
    const t = setTimeout(() => void unlock(), 0);
    return () => clearTimeout(t);
    // Mount-only: later locks are prompted from the AppState handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.flex}>
      {children}
      {locked ? (
        <View style={styles.cover} testID="lock-screen" accessibilityViewIsModal>
          <Icon name="lock-outline" size={56} color={colors.primary} />
          <AppText variant="title" center>
            Cash Travel נעולה
          </AppText>
          {message ? (
            <AppText variant="label" color={colors.danger} center>
              {message}
            </AppText>
          ) : null}
          <Button label="פתיחה" icon="fingerprint" onPress={unlock} busy={busy} testID="unlock" />
        </View>
      ) : message ? (
        <View style={styles.toast} testID="lock-warning">
          <AppText variant="caption" color={colors.warning}>
            {message}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  toast: { position: 'absolute', top: space.xxl + space.lg, left: space.lg, right: space.lg, backgroundColor: colors.warningSoft, padding: space.md, borderRadius: 12 },
});
