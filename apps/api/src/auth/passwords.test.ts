import { expect, test } from 'bun:test'
import { hashPassword, verifyPassword } from './passwords'

test('hashes with argon2id and verifies', async () => {
  const hash = await hashPassword('correct horse battery staple')
  expect(hash.startsWith('$argon2id$')).toBe(true)
  expect(hash).not.toContain('correct horse')
  expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  expect(await verifyPassword('wrong password', hash)).toBe(false)
})
