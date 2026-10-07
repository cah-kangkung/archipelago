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

export const jsonBody = <T extends z.ZodType>(schema: T) =>
  validator('json', (value): z.output<T> => {
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
