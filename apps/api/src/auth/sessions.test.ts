import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertUser } from '../../test/fixtures'
import { sessions } from '../db/schema'
import { sha256Hex } from './crypto'
import { createSession, deleteSession, findSessionUser } from './sessions'

const DAY_MS = 86_400_000

describe('sessions', () => {
  test('a created session resolves to its user', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { email: 'boss@example.com' })
      const { token, expiresAt } = await createSession(tx, user.id, 30)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS)
      expect(await findSessionUser(tx, token)).toEqual({
        id: user.id,
        email: 'boss@example.com',
        timezone: 'Asia/Jakarta',
      })
    })
  })

  test('only the token hash is stored', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 30)
      const rows = await tx.select().from(sessions).where(eq(sessions.userId, user.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).not.toBe(token)
      expect(rows[0]?.id).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  test('expired sessions do not resolve', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 1, new Date(Date.now() - 2 * DAY_MS))
      expect(await findSessionUser(tx, token)).toBeNull()
    })
  })

  test('unknown and empty tokens do not resolve', async () => {
    await withRollback(async (tx) => {
      expect(await findSessionUser(tx, 'not-a-real-token')).toBeNull()
      expect(await findSessionUser(tx, '')).toBeNull()
    })
  })

  test('deleted sessions do not resolve', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 30)
      await deleteSession(tx, token)
      expect(await findSessionUser(tx, token)).toBeNull()
    })
  })

  test("creating a session prunes that user's expired sessions only", async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const other = await insertUser(tx)
      const expired = await createSession(tx, user.id, 1, new Date(Date.now() - 2 * DAY_MS))
      const valid = await createSession(tx, user.id, 30)
      const othersExpired = await createSession(tx, other.id, 1, new Date(Date.now() - 2 * DAY_MS))

      const fresh = await createSession(tx, user.id, 30)

      const ids = (await tx.select().from(sessions).where(eq(sessions.userId, user.id))).map(
        (r) => r.id,
      )
      expect(ids).not.toContain(sha256Hex(expired.token))
      expect(ids).toContain(sha256Hex(valid.token))
      expect(ids).toContain(sha256Hex(fresh.token))
      const otherIds = (await tx.select().from(sessions).where(eq(sessions.userId, other.id))).map(
        (r) => r.id,
      )
      expect(otherIds).toContain(sha256Hex(othersExpired.token))
    })
  })
})
