import type { Migration } from '../migrate';
import { m0001CoreSchema } from './0001_core_schema';

/** Ordered schema migrations. Append only; never edit a shipped migration. */
export const MIGRATIONS: readonly Migration[] = [m0001CoreSchema];
