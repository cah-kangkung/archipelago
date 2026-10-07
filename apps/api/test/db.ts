import { createDb, type Db } from '../src/db/client'

const url = process.env.DATABASE_URL_TEST
if (!url)
  throw new Error('DATABASE_URL_TEST is not set. Copy apps/api/.env.example to apps/api/.env')

const { db, close } = createDb(url)
export const testDb = db
export const closeTestDb = close

class Rollback extends Error {}

/** Runs `fn` inside a transaction that is always rolled back, so tests never leak rows. */
export async function withRollback(fn: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
}
