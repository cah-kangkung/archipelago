export function isValidTimezone(tz: string): boolean {
  if (tz.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
