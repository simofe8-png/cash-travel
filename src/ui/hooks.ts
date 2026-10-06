import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import type { RateNeed } from '../application/fx/FxRateService';
import { useApp } from './AppContext';
import { renderTripReportHtml } from './report/reportHtml';

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

/** PDF trip report via the Android share/save sheet (Settings and Summary share this flow). */
export function useReportExport(tripId: number | null): { exporting: boolean; exportReport: () => Promise<void> } {
  const { services } = useApp();
  const [exporting, setExporting] = useState(false);
  const exportReport = async () => {
    if (tripId === null) return;
    setExporting(true);
    try {
      const r = await services.tripReportService.share(tripId, renderTripReportHtml);
      if (r === 'sharing_unavailable') Alert.alert('לא ניתן לשתף', 'שיתוף קבצים אינו זמין במכשיר הזה.');
    } catch (e) {
      console.warn('PDF export failed:', (e as Error).message);
      Alert.alert('הדוח לא נוצר', 'נסו שוב.');
    } finally {
      setExporting(false);
    }
  };
  return { exporting, exportReport };
}
