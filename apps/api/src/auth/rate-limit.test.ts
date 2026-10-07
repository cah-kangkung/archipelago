import { expect, test } from 'bun:test'
import { createFixedWindowLimiter } from './rate-limit'

test('allows up to the limit, then blocks', () => {
  const limiter = createFixedWindowLimiter({ limit: 3, windowMs: 1000 })
  expect([1, 2, 3, 4].map(() => limiter.hit('a', 0))).toEqual([true, true, true, false])
})

test('keys are independent', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1000 })
  expect(limiter.hit('a', 0)).toBe(true)
  expect(limiter.hit('a', 0)).toBe(false)
  expect(limiter.hit('b', 0)).toBe(true)
})

test('the window resets', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1000 })
  expect(limiter.hit('a', 0)).toBe(true)
  expect(limiter.hit('a', 999)).toBe(false)
  expect(limiter.hit('a', 1000)).toBe(true)
})
