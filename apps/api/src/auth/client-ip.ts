import type { Context } from 'hono'
import { getConnInfo } from 'hono/bun'

/**
 * With TRUST_PROXY=true the API sits behind Caddy, which overwrites
 * X-Forwarded-For from untrusted clients, so the first entry is the real client.
 * Otherwise the header is attacker-controlled and ignored.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
