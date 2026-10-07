import { parseArgs } from 'node:util'
import { SeedUserError, seedUser } from '../auth/seed-user'
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    timezone: { type: 'string', default: 'Asia/Jakarta' },
  },
})

const password = values.password ?? prompt('Password (min 12 characters):') ?? ''
const config = loadConfig(process.env)
const { db, close } = createDb(config.databaseUrl)

try {
  await runMigrations(db)
  const user = await seedUser(db, {
    email: values.email ?? '',
    password,
    timezone: values.timezone,
  })
  console.log(`Created user ${user.email} (${user.id}), timezone ${user.timezone}`)
} catch (err) {
  if (!(err instanceof SeedUserError)) throw err
  console.error(err.message)
  process.exitCode = 1
} finally {
  await close()
}
