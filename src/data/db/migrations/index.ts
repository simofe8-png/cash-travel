import type { Migration } from '../migrate';
import { m0001CoreSchema } from './0001_core_schema';
import { m0002TripPurge } from './0002_trip_purge';

/** Ordered schema migrations. Append only; never edit a shipped migration. */
export const MIGRATIONS: readonly Migration[] = [m0001CoreSchema, m0002TripPurge];
