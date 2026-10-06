import type { Clock } from '../application/ports/Clock';
import { CurrencyApiProvider } from '../infrastructure/fx/CurrencyApiProvider';
import { FrankfurterProvider } from '../infrastructure/fx/FrankfurterProvider';
import type { FetchLike } from '../infrastructure/fx/http';
import { createServices, type AppServices } from './createServices';
import { openAppDatabase } from './database';

/** Device clock: current instant and the device's current UTC offset. */
export const deviceClock: Clock = {
  now: () => new Date().toISOString(),
  offsetMinutes: () => -new Date().getTimezoneOffset(),
};

let instance: AppServices | null = null;

/** Opens the database (running migrations) and wires services once per process. */
export function getAppServices(): AppServices {
  if (!instance) {
    const { db } = openAppDatabase();
    const fetchFn = globalThis.fetch as unknown as FetchLike;
    instance = createServices(db, deviceClock, [new FrankfurterProvider(fetchFn), new CurrencyApiProvider(fetchFn)]);
  }
  return instance;
}
