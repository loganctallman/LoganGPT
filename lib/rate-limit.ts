export const RATE_LIMIT = 20;
export const RATE_WINDOW = 60_000; // 1 minute (ms)

const globalStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * `now` and `store` are injectable for testing.
 */
export function checkRateLimit(
  ip: string,
  now = Date.now(),
  store: Map<string, { count: number; resetAt: number }> = globalStore
): boolean {
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}
