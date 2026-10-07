import { describe, expect, test } from 'bun:test'
import type { ErrorBody } from '@archipelago/shared'
import { withRollback } from '../../test/db'
import { testConfig } from '../../test/fixtures'
import { postJson } from '../../test/http'
import { createApp } from '../app'

const LOGIN = '/api/v1/auth/login'
// An empty body fails validation (422) without hashing, so the tests stay fast.
// The limiter runs before validation, so these attempts still count.
const attempt = (app: ReturnType<typeof createApp>, ip: string) =>
  postJson(app, LOGIN, {}, { 'x-forwarded-for': ip })

describe('login rate limit', () => {
  test('the 11th attempt from one IP within 15 minutes → 429', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      for (let i = 0; i < 10; i++) expect((await attempt(app, '203.0.113.7')).status).toBe(422)
      const res = await attempt(app, '203.0.113.7')
      expect(res.status).toBe(429)
      expect(((await res.json()) as ErrorBody).error.code).toBe('rate_limited')
      expect((await attempt(app, '198.51.100.1')).status).toBe(422)
    })
  })

  test('the limit lifts after the window', async () => {
    await withRollback(async (tx) => {
      let clock = new Date('2026-10-07T00:00:00Z')
      const app = createApp({ db: tx, config: testConfig, now: () => clock })
      for (let i = 0; i < 10; i++) await attempt(app, '203.0.113.7')
      expect((await attempt(app, '203.0.113.7')).status).toBe(429)
      clock = new Date(clock.getTime() + 15 * 60_000)
      expect((await attempt(app, '203.0.113.7')).status).toBe(422)
    })
  })

  test('spoofed X-Forwarded-For is ignored when TRUST_PROXY=false', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: { ...testConfig, trustProxy: false } })
      for (let i = 0; i < 10; i++) await attempt(app, `10.0.0.${i}`)
      expect((await attempt(app, '10.0.0.99')).status).toBe(429)
    })
  })
})
