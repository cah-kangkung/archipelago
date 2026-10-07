import { validator } from 'hono/validator'
import type { z } from 'zod'
import { AppError } from './errors'

export function toFieldErrors(err: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= []
    fields[key].push(issue.message)
  }
  return fields
}

const JSON_CONTENT_TYPE = /^\s*application\/json\s*(;|$)/i

export const jsonBody = <T extends z.ZodType>(schema: T) =>
  validator('json', (value, c): z.output<T> => {
    if (!JSON_CONTENT_TYPE.test(c.req.header('content-type') ?? '')) {
      throw new AppError('bad_request', 'Content-Type must be application/json')
    }
    const result = schema.safeParse(value)
    if (!result.success) {
      throw new AppError(
        'validation_failed',
        'Request body is invalid',
        toFieldErrors(result.error),
      )
    }
    return result.data
  })

export const queryParams = <T extends z.ZodType>(schema: T) =>
  validator('query', (value): z.output<T> => {
    const result = schema.safeParse(value)
    if (!result.success) {
      throw new AppError('validation_failed', 'Query is invalid', toFieldErrors(result.error))
    }
    return result.data
  })
