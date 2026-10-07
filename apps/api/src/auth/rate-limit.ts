export type RateLimiter = { hit(key: string, nowMs: number): boolean }

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60_000 }

const SWEEP_THRESHOLD = 10_000

export function createFixedWindowLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return {
    hit(key, nowMs) {
      if (buckets.size > SWEEP_THRESHOLD) {
        for (const [k, b] of buckets) if (nowMs >= b.resetAt) buckets.delete(k)
      }
      const bucket = buckets.get(key)
      if (!bucket || nowMs >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: nowMs + opts.windowMs })
        return true
      }
      bucket.count += 1
      return bucket.count <= opts.limit
    },
  }
}
