import { validator } from 'hono/validator'
import { z } from 'zod'
import { AppError } from '../errors'

const uuid = z.uuid()

/** Path ids that are not UUIDs would make Postgres throw (22P02); treat them as plain 404s. */
export function idParam(value: string | undefined, what: string): string {
  if (value === undefined || !uuid.safeParse(value).success) {
    throw new AppError('not_found', `${what} not found`)
  }
  return value
}

/** Validates the `:id` path param first, so a malformed id is a 404 even when the body is bad too. */
export const validId = (what: string) =>
  validator('param', (value) => {
    idParam(value.id, what)
    return value
  })
