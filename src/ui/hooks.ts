import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { RateNeed } from '../application/fx/FxRateService';
import { useApp } from './AppContext';

/**
 * Background reference-rate refresh for display purposes. Never on a save path: failures are
 * ignored (offline is normal). Retries when the needs change and whenever the app returns to the
 * foreground (e.g. after connectivity comes back); re-reads only when something new was cached.
 */
export function useRateRefresh(needs: readonly RateNeed[], target: string | null): void {
  const { services, notifyChanged } = useApp();
  const [foregroundTick, setForegroundTick] = useState(0);
  const key = target ? `${target}|${JSON.stringify(needs)}|${foregroundTick}` : '';
  const last = useRef('');
  const running = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setForegroundTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!target || !key || key === last.current || running.current) return;
    last.current = key;
    if (services.fxRateService.missing(needs, target).length === 0) return;
    let alive = true;
    running.current = true;
    services.fxRateService
      .refresh(needs, target)
      .then((r) => {
        if (alive && r.saved > 0) notifyChanged();
      })
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
      });
    return () => {
      alive = false;
    };
    // `key` captures needs/target/foreground retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
