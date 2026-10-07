import { seedUserInputSchema } from '@archipelago/shared'
import type { Db } from '../db/client'
import { isUniqueViolation } from '../db/pg-errors'
import { users } from '../db/schema'
import type { AuthUser } from '../types'
import { hashPassword } from './passwords'

export class SeedUserError extends Error {}

export async function seedUser(db: Db, input: unknown): Promise<AuthUser> {
  const parsed = seedUserInputSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new SeedUserError(`Invalid input: ${details.join('; ')}`)
  }
  const { email, password, timezone } = parsed.data

  try {
    const [user] = await db
      .insert(users)
      .values({ email, timezone, passwordHash: await hashPassword(password) })
      .returning({ id: users.id, email: users.email, timezone: users.timezone })
    if (!user) throw new Error('seedUser: no row returned')
    return user
  } catch (err) {
    if (isUniqueViolation(err)) throw new SeedUserError(`A user with email ${email} already exists`)
    throw err
  }
}
