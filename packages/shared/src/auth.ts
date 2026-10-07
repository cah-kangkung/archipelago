import { z } from 'zod'
import { isValidTimezone } from './timezone'

export const PASSWORD_MIN_LENGTH = 12

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const seedUserInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
  timezone: z.string().refine(isValidTimezone, 'Unknown IANA timezone'),
})
export type SeedUserInput = z.infer<typeof seedUserInputSchema>

export const createApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
})
export type CreateApiTokenInput = z.infer<typeof createApiTokenInputSchema>
