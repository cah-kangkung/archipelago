import { expect, test } from 'bun:test'
import type { ErrorBody } from '@archipelago/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError, handleError } from './errors'
import { jsonBody } from './validate'

const app = new Hono()
app.onError(handleError)
app.post('/echo', jsonBody(z.object({ name: z.string().min(1) })), (c) =>
  c.json(c.req.valid('json')),
)
app.get('/conflict', () => {
  throw new AppError('conflict', 'Plot is occupied')
})
app.get('/boom', () => {
  throw new Error('secret internals')
})

const post = (body: string) =>
  app.request('/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body })

test('valid body passes through', async () => {
  const res = await post(JSON.stringify({ name: 'Ada' }))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ name: 'Ada' })
})

test('schema failure → 422 with field errors', async () => {
  const res = await post(JSON.stringify({ name: '' }))
  expect(res.status).toBe(422)
  const body = (await res.json()) as ErrorBody
  expect(body.error.code).toBe('validation_failed')
  expect(body.error.fields?.name).toBeArray()
})

test('malformed JSON → 400 bad_request, not 500', async () => {
  const res = await post('{"name":')
  expect(res.status).toBe(400)
  expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request')
})

test('empty JSON body → 400 bad_request', async () => {
  const res = await post('')
  expect(res.status).toBe(400)
  expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request')
})

test('non-JSON content types → 400 bad_request', async () => {
  const body = JSON.stringify({ name: 'Ada' })
  for (const headers of [{ 'content-type': 'text/plain' }, {}] as Record<string, string>[]) {
    const res = await app.request('/echo', { method: 'POST', headers, body })
    expect(res.status).toBe(400)
    expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request')
  }
})

test('content type parameters and casing are accepted', async () => {
  const res = await app.request('/echo', {
    method: 'POST',
    headers: { 'content-type': 'Application/JSON; charset=utf-8' },
    body: JSON.stringify({ name: 'Ada' }),
  })
  expect(res.status).toBe(200)
})

test('AppError maps to its status', async () => {
  const res = await app.request('/conflict')
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'Plot is occupied' } })
})

test('unexpected errors → 500 without leaking internals', async () => {
  const res = await app.request('/boom')
  expect(res.status).toBe(500)
  const text = await res.text()
  expect(text).not.toContain('secret internals')
  expect((JSON.parse(text) as ErrorBody).error.code).toBe('internal')
})
