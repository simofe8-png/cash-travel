/** Current time source. Injected so use-cases and tests are deterministic. */
export interface Clock {
  /** Current instant, ISO-8601 UTC. */
  now(): string;
  /** Device UTC offset in minutes east of UTC at that instant (Israel summer = 180). */
  offsetMinutes(): number;
}
