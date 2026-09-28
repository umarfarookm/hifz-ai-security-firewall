/**
 * Per-IP rate limiting (docs/architecture/LLD.md §9). In-memory, scoped to
 * one running process.
 *
 * [ASSUMPTION] On Vercel's serverless runtime, each invocation can land on
 * a different instance with its own memory — this limiter only actually
 * catches abuse within a single warm instance, not globally across the
 * whole deployment. A fully correct version needs a shared store (Supabase
 * or similar), which is more latency and complexity than a hackathon demo
 * needs — see the "deliberately not building Redis" note in CLAUDE.md.
 * This is a real, if partial, safety net — not a no-op — and worth
 * replacing with a shared-store version if this ever needs to hold up
 * under real abuse.
 */
interface Bucket {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkRateLimit(key: string, limitPerMinute: number, now = Date.now()): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartMs >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, remaining: limitPerMinute - 1 };
  }

  if (existing.count >= limitPerMinute) {
    return { allowed: false, remaining: 0 };
  }

  existing.count++;
  return { allowed: true, remaining: limitPerMinute - existing.count };
}

/** Test-only — clears all rate-limit state between test cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
