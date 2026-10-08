import { sql } from 'drizzle-orm'
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoWorld } from './demo-world'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const config = loadConfig(process.env)
const host = new URL(config.databaseUrl).hostname
if (!LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to reset ${host}: seed:demo only runs against a local database.`)
  process.exit(1)
}

const { db, close } = createDb(config.databaseUrl)
try {
  // Wipe everything, including drizzle's migration journal, then rebuild from the migrations.
  await db.execute(sql`drop schema if exists drizzle cascade`)
  await db.execute(sql`drop schema if exists public cascade`)
  await db.execute(sql`create schema public`)
  await runMigrations(db)
  await seedDemoWorld(db, new Date())
  console.log(
    `Reset ${host} and seeded the demo world. Password for every account: ${DEMO_PASSWORD}`,
  )
  for (const [role, email] of Object.entries(DEMO_ACCOUNTS))
    console.log(`  ${role.padEnd(6)} ${email}`)
} finally {
  await close()
}
