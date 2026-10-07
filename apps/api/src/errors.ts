import { ERROR_STATUS, type ErrorBody, type ErrorCode } from '@archipelago/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message)
  }

  get status(): ContentfulStatusCode {
    return ERROR_STATUS[this.code]
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>,
): ErrorBody {
  return { error: fields ? { code, message, fields } : { code, message } }
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError)
    return c.json(errorBody(err.code, err.message, err.fields), err.status)
  if (err instanceof HTTPException && err.status === 400) {
    return c.json(errorBody('bad_request', err.message || 'Bad request'), 400)
  }
  console.error(err)
  return c.json(errorBody('internal', 'Internal server error'), 500)
}
