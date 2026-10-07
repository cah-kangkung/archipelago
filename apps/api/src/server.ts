import { createApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'
import { runMigrations } from './db/migrate'

const config = loadConfig(process.env)
const { db } = createDb(config.databaseUrl)
await runMigrations(db)

const app = createApp({ db, config })
// Bun passes the server as the second fetch argument, which hono/bun's getConnInfo reads.
const server = Bun.serve({ port: config.port, fetch: app.fetch })
console.log(`API listening on :${server.port}`)
