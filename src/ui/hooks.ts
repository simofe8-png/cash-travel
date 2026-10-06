import { useEffect, useRef } from 'react';

import type { RateNeed } from '../application/fx/FxRateService';
import { useApp } from './AppContext';

/**
 * Background reference-rate refresh for display purposes. Never on a save path: failures are
 * ignored (offline is normal) and only trigger a re-read when something new was cached.
 */
export function useRateRefresh(needs: readonly RateNeed[], target: string | null): void {
  const { services, notifyChanged } = useApp();
  const key = target ? `${target}|${JSON.stringify(needs)}` : '';
  const last = useRef('');
  useEffect(() => {
    if (!target || !key || key === last.current) return;
    last.current = key;
    if (services.fxRateService.missing(needs, target).length === 0) return;
    let alive = true;
    services.fxRateService
      .refresh(needs, target)
      .then((r) => {
        if (alive && r.saved > 0) notifyChanged();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // `key` captures needs/target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
