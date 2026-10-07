import { expect, test } from 'bun:test'
import { canonicalTimezone, isValidTimezone } from './timezone'

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

test('canonicalTimezone normalises casing', () => {
  expect(canonicalTimezone('asia/jakarta')).toBe('Asia/Jakarta')
  expect(canonicalTimezone('Asia/Jakarta')).toBe('Asia/Jakarta')
})

test('canonicalTimezone rejects blanks, offsets and unknown zones', () => {
  expect(canonicalTimezone('')).toBeNull()
  expect(canonicalTimezone('+01:00')).toBeNull()
  expect(canonicalTimezone('-05:00')).toBeNull()
  expect(canonicalTimezone('Mars/Olympus_Mons')).toBeNull()
  expect(isValidTimezone('+01:00')).toBe(false)
  expect(isValidTimezone('-05:00')).toBe(false)
})
