import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { users } from '../db/schema'
import { verifyPassword } from './passwords'
import { SeedUserError, seedUser } from './seed-user'

const valid = {
  email: '  Boss@Example.com ',
  password: 'correct horse battery staple',
  timezone: 'Asia/Jakarta',
}

describe('seedUser', () => {
  test('creates the user with a normalised email and an argon2id hash', async () => {
    await withRollback(async (tx) => {
      const user = await seedUser(tx, valid)
      expect(user).toMatchObject({ email: 'boss@example.com', timezone: 'Asia/Jakarta' })
      const [row] = await tx.select().from(users).where(eq(users.id, user.id))
      expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true)
      expect(await verifyPassword(valid.password, row?.passwordHash ?? '')).toBe(true)
    })
  })

  test('a duplicate email is a SeedUserError, not a raw database error', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      await seedUser(tx, valid)
      await seedUser(tx, { ...valid, email: 'boss@example.com' })
    }).catch((err) => {
      caught = err
    })
    expect(caught).toBeInstanceOf(SeedUserError)
    expect((caught as Error).message).toBe('A user with email boss@example.com already exists')
  })

  test('invalid input is a SeedUserError naming the bad fields', async () => {
    await withRollback(async (tx) => {
      const attempt = seedUser(tx, { ...valid, password: 'short', timezone: 'Nowhere/Land' })
      await expect(attempt).rejects.toBeInstanceOf(SeedUserError)
      await expect(attempt).rejects.toThrow(/password.*timezone|timezone.*password/)
    })
  })
})
