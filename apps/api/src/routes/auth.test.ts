import { describe, expect, test } from 'bun:test'
import { withRollback } from '../../test/db'
import { insertUserWithPassword, testConfig } from '../../test/fixtures'
import { postJson, sessionCookieFrom } from '../../test/http'
import { createApp } from '../app'
import { createSession } from '../auth/sessions'
import type { Config } from '../config'
import type { Db } from '../db/client'
import type { AuthUser } from '../types'

type ErrorBody = { error: { code: string; message: string; fields: Record<string, unknown> } }
type UserBody = { user: AuthUser }

const appFor = (db: Db, config: Config = testConfig) => createApp({ db, config })
const LOGIN = '/api/v1/auth/login'
const ME = '/api/v1/auth/me'
const LOGOUT = '/api/v1/auth/logout'

describe('POST /auth/login', () => {
  test('valid credentials → 200, user body and a hardened session cookie', async () => {
    await withRollback(async (tx) => {
      const { user, password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const res = await postJson(appFor(tx), LOGIN, { email: 'boss@example.com', password })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        user: { id: user.id, email: 'boss@example.com', timezone: 'Asia/Jakarta' },
      })
      const cookie = res.headers.get('set-cookie') ?? ''
      expect(cookie).toContain('session=')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Secure')
    })
  })

  test('cookie omits Secure when COOKIE_SECURE=false', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx, { ...testConfig, cookieSecure: false })
      const res = await postJson(app, LOGIN, { email: 'boss@example.com', password })
      expect(res.headers.get('set-cookie') ?? '').not.toContain('Secure')
    })
  })

  test('email is matched case- and whitespace-insensitively', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const res = await postJson(appFor(tx), LOGIN, { email: '  Boss@Example.COM ', password })
      expect(res.status).toBe(200)
    })
  })

  test('wrong password and unknown email return the same 401', async () => {
    await withRollback(async (tx) => {
      await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const wrongPw = await postJson(app, LOGIN, { email: 'boss@example.com', password: 'nope' })
      const unknown = await postJson(app, LOGIN, { email: 'ghost@example.com', password: 'nope' })
      const expected = { error: { code: 'unauthorized', message: 'Invalid email or password' } }
      expect(wrongPw.status).toBe(401)
      expect(await wrongPw.json()).toEqual(expected)
      expect(unknown.status).toBe(401)
      expect(await unknown.json()).toEqual(expected)
      expect(wrongPw.headers.get('set-cookie')).toBeNull()
    })
  })

  test('missing fields → 422 with field errors', async () => {
    await withRollback(async (tx) => {
      const res = await postJson(appFor(tx), LOGIN, {})
      expect(res.status).toBe(422)
      const body = (await res.json()) as ErrorBody
      expect(body.error.code).toBe('validation_failed')
      expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']))
    })
  })

  test('malformed JSON → 400', async () => {
    await withRollback(async (tx) => {
      const res = await appFor(tx).request(LOGIN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":',
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request')
    })
  })
})

describe('GET /auth/me', () => {
  test('returns the user for a valid session', async () => {
    await withRollback(async (tx) => {
      const { user, password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const cookie = sessionCookieFrom(
        await postJson(app, LOGIN, { email: 'boss@example.com', password }),
      )
      const res = await app.request(ME, { headers: { cookie } })
      expect(res.status).toBe(200)
      expect(((await res.json()) as UserBody).user.id).toBe(user.id)
    })
  })

  test('401 without a cookie, with a garbage cookie, or with an expired session', async () => {
    await withRollback(async (tx) => {
      const { user } = await insertUserWithPassword(tx)
      const app = appFor(tx)
      const expired = await createSession(tx, user.id, 1, new Date(Date.now() - 2 * 86_400_000))
      const cases: Record<string, string>[] = [
        {},
        { cookie: 'session=garbage' },
        { cookie: 'session=%E0%A4%A' },
        { cookie: `session=${expired.token}` },
      ]
      for (const headers of cases) {
        const res = await app.request(ME, { headers })
        expect(res.status).toBe(401)
        expect(((await res.json()) as ErrorBody).error.code).toBe('unauthorized')
      }
    })
  })
})

describe('POST /auth/logout', () => {
  test('invalidates the session and clears the cookie', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const cookie = sessionCookieFrom(
        await postJson(app, LOGIN, { email: 'boss@example.com', password }),
      )
      const res = await app.request(LOGOUT, { method: 'POST', headers: { cookie } })
      expect(res.status).toBe(204)
      expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
      expect((await app.request(ME, { headers: { cookie } })).status).toBe(401)
    })
  })

  test('is idempotent without a session', async () => {
    await withRollback(async (tx) => {
      const res = await appFor(tx).request(LOGOUT, { method: 'POST' })
      expect(res.status).toBe(204)
    })
  })
})
