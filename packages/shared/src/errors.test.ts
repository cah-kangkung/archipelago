import { describe, expect, test } from 'bun:test'
import { ERROR_CODES, ERROR_STATUS, errorBodySchema } from './errors'

describe('error codes', () => {
  test('every code maps to an HTTP status', () => {
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeNumber()
  })

  test('statuses match the spec', () => {
    expect(ERROR_STATUS).toEqual({
      bad_request: 400,
      unauthorized: 401,
      not_found: 404,
      conflict: 409,
      validation_failed: 422,
      rate_limited: 429,
      internal: 500,
    })
  })

  test('errorBodySchema accepts the standard shape with optional fields', () => {
    expect(
      errorBodySchema.safeParse({ error: { code: 'not_found', message: 'Nope' } }).success,
    ).toBe(true)
    expect(
      errorBodySchema.safeParse({
        error: { code: 'validation_failed', message: 'Bad', fields: { email: ['Invalid'] } },
      }).success,
    ).toBe(true)
    expect(errorBodySchema.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(
      false,
    )
  })
})
