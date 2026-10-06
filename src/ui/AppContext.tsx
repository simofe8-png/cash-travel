import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { AppServices } from '../composition/createServices';

interface AppContextValue {
  readonly services: AppServices;
  /** Increments after every successful mutation so screens re-read derived data. */
  readonly version: number;
  readonly notifyChanged: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const notifyChanged = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ services, version, notifyChanged }), [services, version, notifyChanged]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/**
 * Reads derived data through application services; recomputed when data changes or the screen
 * regains focus (cheap SQLite reads; caches are never authoritative).
 */
export function useQuery<T>(read: (s: AppServices) => T, deps: readonly unknown[] = []): T {
  const { services, version } = useApp();
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => setFocusTick((t) => t + 1), []));
  const depsKey = JSON.stringify(deps);
  // `read` is intentionally keyed by depsKey (callers pass inline closures).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(services), [services, version, focusTick, depsKey]);
}
