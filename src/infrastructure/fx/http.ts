export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** GET a JSON document over HTTPS with a timeout. Sends no user data beyond the URL itself. */
export async function getJson(fetchFn: FetchLike, url: string, timeoutMs = 10_000): Promise<unknown> {
  if (!url.startsWith('https://')) throw new ProviderError('Only HTTPS endpoints are allowed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const DECIMAL = /^\d{1,12}(\.\d{1,12})?$/;

/**
 * Converts a JSON number from a provider into a canonical positive decimal string, or null when
 * it is not a plain positive finite decimal (exponent forms, zero, negatives are rejected).
 */
export function toRateString(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const s = String(n);
  return DECIMAL.test(s) ? s : null;
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
