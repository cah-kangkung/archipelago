import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { startTicker, TICK_MS, type TickerDemand, tickerWanted } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startTicker', () => {
  test('invalidates every tick while visible and stops when told', () => {
    vi.useFakeTimers()
    const invalidate = vi.fn()
    const stop = startTicker(invalidate, () => true)
    vi.advanceTimersByTime(TICK_MS * 3)
    expect(invalidate).toHaveBeenCalledTimes(3)
    stop()
    vi.advanceTimersByTime(TICK_MS * 3)
    expect(invalidate).toHaveBeenCalledTimes(3)
  })

  test('skips frames while the document is hidden', () => {
    vi.useFakeTimers()
    const invalidate = vi.fn()
    let visible = false
    const stop = startTicker(invalidate, () => visible)
    vi.advanceTimersByTime(TICK_MS * 2)
    expect(invalidate).not.toHaveBeenCalled()
    visible = true
    vi.advanceTimersByTime(TICK_MS)
    expect(invalidate).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('usePrefersReducedMotion', () => {
  test('reads the reduced-motion media query', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia
    try {
      expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
    } finally {
      window.matchMedia = original
    }
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })
})

describe('tickerWanted', () => {
  const still: TickerDemand = {
    animate: true,
    seaWave: false,
    cranes: false,
    effects: false,
    camera: false,
    life: false,
    growth: false,
  }

  test('runs while anything moves, each condition on its own', () => {
    expect(tickerWanted(still)).toBe(false)
    for (const key of ['seaWave', 'cranes', 'effects', 'camera', 'life', 'growth'] as const) {
      expect(tickerWanted({ ...still, [key]: true })).toBe(true)
    }
  })

  test('never runs under reduced motion', () => {
    expect(
      tickerWanted({
        animate: false,
        seaWave: true,
        cranes: true,
        effects: true,
        camera: true,
        life: true,
        growth: true,
      }),
    ).toBe(false)
  })
})
