import { expect, test } from 'bun:test'
import { isValidTimezone } from './timezone'

test('accepts IANA timezones', () => {
  expect(isValidTimezone('Asia/Jakarta')).toBe(true)
  expect(isValidTimezone('UTC')).toBe(true)
  expect(isValidTimezone('America/New_York')).toBe(true)
})

test('rejects unknown or empty timezones', () => {
  expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false)
  expect(isValidTimezone('')).toBe(false)
  expect(isValidTimezone('   ')).toBe(false)
})
