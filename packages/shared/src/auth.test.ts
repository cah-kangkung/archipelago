import { describe, expect, test } from 'bun:test'
import {
  createApiTokenInputSchema,
  loginInputSchema,
  PASSWORD_MIN_LENGTH,
  seedUserInputSchema,
} from './auth'

describe('loginInputSchema', () => {
  test('normalises email case and whitespace', () => {
    const parsed = loginInputSchema.parse({ email: '  Boss@Example.COM ', password: 'x' })
    expect(parsed.email).toBe('boss@example.com')
  })

  test('rejects invalid email and empty password', () => {
    const r = loginInputSchema.safeParse({ email: 'not-an-email', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('email')
      expect(paths).toContain('password')
    }
  })
})

describe('seedUserInputSchema', () => {
  const valid = { email: 'boss@example.com', password: 'x'.repeat(12), timezone: 'Asia/Jakarta' }

  test('accepts a valid seed input', () => {
    expect(seedUserInputSchema.safeParse(valid).success).toBe(true)
  })

  test(`rejects passwords shorter than ${PASSWORD_MIN_LENGTH}`, () => {
    expect(seedUserInputSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
  })

  test('canonicalises the timezone name', () => {
    const parsed = seedUserInputSchema.parse({ ...valid, timezone: 'asia/jakarta' })
    expect(parsed.timezone).toBe('Asia/Jakarta')
  })

  test('rejects UTC offsets as timezones', () => {
    expect(seedUserInputSchema.safeParse({ ...valid, timezone: '+01:00' }).success).toBe(false)
  })

  test('rejects unknown timezones', () => {
    expect(seedUserInputSchema.safeParse({ ...valid, timezone: 'Nowhere/Land' }).success).toBe(
      false,
    )
  })
})

describe('createApiTokenInputSchema', () => {
  test('trims the name', () => {
    expect(createApiTokenInputSchema.parse({ name: '  GitLab sync ' }).name).toBe('GitLab sync')
  })

  test('rejects blank and over-long names', () => {
    expect(createApiTokenInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createApiTokenInputSchema.safeParse({ name: 'x'.repeat(65) }).success).toBe(false)
  })
})
