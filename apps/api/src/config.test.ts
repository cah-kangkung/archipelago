import { expect, test } from 'bun:test'
import { loadConfig } from './config'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' }

test('applies defaults', () => {
  expect(loadConfig(base)).toEqual({
    databaseUrl: base.DATABASE_URL,
    port: 3000,
    cookieSecure: true,
    trustProxy: false,
    sessionTtlDays: 30,
  })
})

test('parses booleans and numbers from strings', () => {
  const config = loadConfig({ ...base, PORT: '8080', COOKIE_SECURE: 'false', TRUST_PROXY: 'true' })
  expect(config).toMatchObject({ port: 8080, cookieSecure: false, trustProxy: true })
})

test('fails loudly when DATABASE_URL is missing or not postgres', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/)
})
