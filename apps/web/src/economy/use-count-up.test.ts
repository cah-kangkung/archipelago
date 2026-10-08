import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { setReducedMotion } from '../test/viewport'
import { useCountUp } from './use-count-up'

afterEach(() => vi.useRealTimers())
const fakeFrames = () =>
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
const mount = (v: number) => renderHook(({ v }) => useCountUp(v), { initialProps: { v } })

describe('useCountUp', () => {
  test('shows the first value at once, then eases to a new one over 600ms', () => {
    fakeFrames()
    const { result, rerender } = mount(10)
    expect(result.current).toBe(10)
    rerender({ v: 110 })
    expect(result.current).toBe(10)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBeGreaterThan(10)
    expect(result.current).toBeLessThan(110)
    act(() => vi.advanceTimersByTime(400))
    expect(result.current).toBe(110)
  })

  test('a new value mid-count continues from the number on screen', () => {
    fakeFrames()
    const { result, rerender } = mount(0)
    rerender({ v: 100 })
    act(() => vi.advanceTimersByTime(200))
    const mid = result.current
    expect(mid).toBeGreaterThan(0)
    rerender({ v: 0 })
    const seen: number[] = []
    for (let i = 0; i < 45; i++) {
      act(() => vi.advanceTimersByTime(16))
      seen.push(result.current)
    }
    // Downward from where it was: never back up toward 100, never a jump to 0.
    expect(Math.max(...seen)).toBeLessThanOrEqual(mid)
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen.at(-1)).toBe(0)
  })

  test('reduced motion shows the new value at once', () => {
    setReducedMotion(true)
    const { result, rerender } = mount(10)
    rerender({ v: 110 })
    expect(result.current).toBe(110)
  })
})
