import { afterAll } from 'bun:test'
import { runMigrations } from '../src/db/migrate'
import { closeTestDb, testDb } from './db'

await runMigrations(testDb)

afterAll(async () => {
  await closeTestDb()
})
