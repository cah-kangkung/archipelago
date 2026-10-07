export function canonicalTimezone(tz: string): string | null {
  // Offsets like "+01:00" are accepted by Intl but are not IANA zones.
  if (tz.trim() === '' || tz.startsWith('+') || tz.startsWith('-')) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export function isValidTimezone(tz: string): boolean {
  return canonicalTimezone(tz) !== null
}
