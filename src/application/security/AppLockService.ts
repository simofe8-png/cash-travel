import type { DeviceAuth, DeviceAuthResult } from '../ports/DeviceAuth';
import type { TripRepository } from '../ports/TripRepository';

const KEY = 'app_lock_enabled';
/** Returning within this time does not re-lock (e.g. the system camera during receipt capture). */
export const RELOCK_AFTER_MS = 60_000;

export type EnableResult = 'enabled' | 'unavailable' | 'not_confirmed';

/**
 * Optional app lock using only the device's own authentication (no custom PIN). The app never
 * locks the owner out: if device authentication becomes unavailable, access is allowed and the
 * UI explains that protection is inactive.
 */
export class AppLockService {
  constructor(
    private readonly settings: Pick<TripRepository, 'getSetting' | 'setSetting'>,
    private readonly auth: DeviceAuth,
  ) {}

  isEnabled(): boolean {
    return this.settings.getSetting(KEY) === '1';
  }

  isAvailable(): Promise<boolean> {
    return this.auth.isAvailable();
  }

  async enable(): Promise<EnableResult> {
    if (!(await this.auth.isAvailable())) return 'unavailable';
    const r = await this.auth.authenticate('אימות להפעלת נעילת האפליקציה');
    if (r !== 'success') return 'not_confirmed';
    this.settings.setSetting(KEY, '1');
    return 'enabled';
  }

  /** Disabling requires authentication too (unless the device can no longer authenticate). */
  async disable(): Promise<boolean> {
    if (await this.auth.isAvailable()) {
      const r = await this.auth.authenticate('אימות לביטול נעילת האפליקציה');
      if (r !== 'success') return false;
    }
    this.settings.setSetting(KEY, null);
    return true;
  }

  /** Whether the app must show the lock now (cold start, or back from background long enough). */
  mustLock(backgroundMs: number | null): boolean {
    if (!this.isEnabled()) return false;
    return backgroundMs === null || backgroundMs >= RELOCK_AFTER_MS;
  }

  /** Attempts to unlock. 'unavailable' unlocks too: the owner is never locked out of their data. */
  async unlock(): Promise<{ unlocked: boolean; result: DeviceAuthResult }> {
    if (!(await this.auth.isAvailable())) return { unlocked: true, result: 'unavailable' };
    const result = await this.auth.authenticate('פתיחת Cash Travel');
    return { unlocked: result === 'success', result };
  }
}
