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
