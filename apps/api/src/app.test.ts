import { expect, test } from 'bun:test'
import type { ErrorBody } from '@archipelago/shared'
import { testDb } from '../test/db'
import { testConfig } from '../test/fixtures'
import { createApp } from './app'

const app = createApp({ db: testDb, config: testConfig })

test('GET /api/v1/health', async () => {
  const res = await app.request('/api/v1/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

test('unknown routes return the error shape', async () => {
  const res = await app.request('/api/v1/nope')
  expect(res.status).toBe(404)
  expect(((await res.json()) as ErrorBody).error.code).toBe('not_found')
})
