import type { Migration } from '../migrate';

/** Ordered schema migrations. Append only; never edit a shipped migration. */
export const MIGRATIONS: readonly Migration[] = [];
