const UNIQUE_VIOLATION = '23505'

const pgCode = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  if ('code' in err && typeof err.code === 'string') return err.code
  // Drizzle >= 0.44 wraps driver errors in DrizzleQueryError with the original as `cause`.
  if ('cause' in err) return pgCode(err.cause)
  return undefined
}

export const isUniqueViolation = (err: unknown): boolean => pgCode(err) === UNIQUE_VIOLATION
