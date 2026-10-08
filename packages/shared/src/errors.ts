import { z } from 'zod'

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'not_found',
  'conflict',
  'insufficient_supplies',
  'validation_failed',
  'rate_limited',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  insufficient_supplies: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
} as const satisfies Record<ErrorCode, number>

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
})
export type ErrorBody = z.infer<typeof errorBodySchema>
