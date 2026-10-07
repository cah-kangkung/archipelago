import { describe, expect, test } from 'bun:test'
import type { ErrorBody } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertUserWithPassword, testConfig } from '../../test/fixtures'
import { postJson, sessionCookieFrom } from '../../test/http'
import { createApp } from '../app'
import type { ApiTokenView } from '../auth/api-tokens'
import type { Db } from '../db/client'
import { apiTokens } from '../db/schema'

const TOKENS = '/api/v1/tokens'
const ME = '/api/v1/auth/me'

type CreatedBody = { token: string; apiToken: ApiTokenView }
type ListBody = { apiTokens: Record<string, unknown>[] }
type MeBody = { user: { id: string } }

async function signedIn(db: Db) {
  const app = createApp({ db, config: testConfig })
  const { user, password } = await insertUserWithPassword(db)
  const cookie = sessionCookieFrom(
    await postJson(app, '/api/v1/auth/login', { email: user.email, password }),
  )
  return { app, user, cookie }
}

describe('/tokens', () => {
  test('requires authentication', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      expect((await app.request(TOKENS)).status).toBe(401)
      expect((await postJson(app, TOKENS, { name: 'x' })).status).toBe(401)
    })
  })

  test('creates a token, returns plaintext once and stores only its hash', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      const res = await postJson(app, TOKENS, { name: '  GitLab sync ' }, { cookie })
      expect(res.status).toBe(201)
      const body = (await res.json()) as CreatedBody
      expect(body.token).toMatch(/^arch_[A-Za-z0-9_-]{43}$/)
      expect(body.apiToken).toMatchObject({ name: 'GitLab sync', lastUsedAt: null })

      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.id, body.apiToken.id))
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row?.tokenHash).not.toBe(body.token)
    })
  })

  test('list never exposes token material', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      await postJson(app, TOKENS, { name: 'one' }, { cookie })
      const res = await app.request(TOKENS, { headers: { cookie } })
      const { apiTokens: list } = (await res.json()) as ListBody
      expect(list).toHaveLength(1)
      expect(Object.keys(list[0] ?? {}).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name'])
    })
  })

  test('rejects blank names with 422', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      expect((await postJson(app, TOKENS, { name: '  ' }, { cookie })).status).toBe(422)
    })
  })

  test('bearer token authenticates and stamps lastUsedAt', async () => {
    await withRollback(async (tx) => {
      const { app, user, cookie } = await signedIn(tx)
      const { token } = (await (
        await postJson(app, TOKENS, { name: 'ci' }, { cookie })
      ).json()) as CreatedBody
      const res = await app.request(ME, { headers: { authorization: `Bearer ${token}` } })
      expect(res.status).toBe(200)
      expect(((await res.json()) as MeBody).user.id).toBe(user.id)
      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.userId, user.id))
      expect(row?.lastUsedAt).toBeInstanceOf(Date)
    })
  })

  test('bad bearer credentials → 401, never 500', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      for (const authorization of ['Bearer garbage', 'Bearer arch_nope', 'Bearer', 'Basic abc']) {
        // A valid cookie alongside does not rescue an invalid Authorization header.
        const res = await app.request(ME, { headers: { authorization, cookie } })
        expect(res.status).toBe(401)
      }
    })
  })

  test('revoked tokens stop working immediately', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      const created = (await (
        await postJson(app, TOKENS, { name: 'ci' }, { cookie })
      ).json()) as CreatedBody
      const del = await app.request(`${TOKENS}/${created.apiToken.id}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      expect(del.status).toBe(204)
      const res = await app.request(ME, { headers: { authorization: `Bearer ${created.token}` } })
      expect(res.status).toBe(401)
    })
  })

  test("cannot delete another user's token, and invalid ids → 404", async () => {
    await withRollback(async (tx) => {
      const owner = await signedIn(tx)
      const other = await signedIn(tx)
      const created = (await (
        await postJson(owner.app, TOKENS, { name: 'mine' }, { cookie: owner.cookie })
      ).json()) as CreatedBody

      const stolen = await other.app.request(`${TOKENS}/${created.apiToken.id}`, {
        method: 'DELETE',
        headers: { cookie: other.cookie },
      })
      expect(stolen.status).toBe(404)
      const stillWorks = await owner.app.request(ME, {
        headers: { authorization: `Bearer ${created.token}` },
      })
      expect(stillWorks.status).toBe(200)

      const bogus = await owner.app.request(`${TOKENS}/abc`, {
        method: 'DELETE',
        headers: { cookie: owner.cookie },
      })
      expect(bogus.status).toBe(404)
      expect(((await bogus.json()) as ErrorBody).error.code).toBe('not_found')
    })
  })
  test('token management rejects bearer tokens, even with a valid cookie', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      const created = (await (
        await postJson(app, TOKENS, { name: 'ci' }, { cookie })
      ).json()) as CreatedBody
      const authorization = `Bearer ${created.token}`
      const id = created.apiToken.id

      const list = await app.request(TOKENS, { headers: { authorization } })
      expect(list.status).toBe(401)
      expect(((await list.json()) as ErrorBody).error.code).toBe('unauthorized')
      expect((await postJson(app, TOKENS, { name: 'x' }, { authorization })).status).toBe(401)
      const del = await app.request(`${TOKENS}/${id}`, {
        method: 'DELETE',
        headers: { authorization },
      })
      expect(del.status).toBe(401)

      // An Authorization header is authoritative: a valid cookie does not rescue it.
      const both = await app.request(TOKENS, { headers: { authorization, cookie } })
      expect(both.status).toBe(401)

      // The token is untouched.
      const me = await app.request(ME, { headers: { authorization } })
      expect(me.status).toBe(200)
    })
  })

  test('unauthenticated DELETE → 401', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      const res = await app.request(`${TOKENS}/${crypto.randomUUID()}`, { method: 'DELETE' })
      expect(res.status).toBe(401)
    })
  })
})
