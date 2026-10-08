import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRewardStore, REWARD_LIFETIME_MS } from './reward-store'

afterEach(() => vi.useRealTimers())

describe('reward store', () => {
  test('push stamps an id and the time, notifies, and each event expires 1.6s after it', () => {
    vi.useFakeTimers({ now: 1000 })
    const store = createRewardStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const a = store.push({ target: { kind: 'task', id: 't1' }, amounts: [25, 12] })
    expect(a).toEqual({ id: 1, target: { kind: 'task', id: 't1' }, amounts: [25, 12], at: 1000 })
    expect(store.get()).toEqual([a])
    vi.advanceTimersByTime(800)
    const b = store.push({ target: null, amounts: [] })
    vi.advanceTimersByTime(REWARD_LIFETIME_MS - 800 - 1)
    expect(store.get()).toEqual([a, b])
    vi.advanceTimersByTime(1)
    expect(store.get()).toEqual([b])
    vi.advanceTimersByTime(800)
    expect(store.get()).toEqual([])
    // Two pushes and two expiries.
    expect(listener).toHaveBeenCalledTimes(4)
  })

  test('get is stable between changes; unsubscribing stops notifications', () => {
    vi.useFakeTimers()
    const store = createRewardStore()
    const first = store.get()
    expect(store.get()).toBe(first)
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    store.push({ target: null, amounts: [5] })
    const second = store.get()
    expect(second).not.toBe(first)
    expect(store.get()).toBe(second)
    stop()
    store.push({ target: null, amounts: [5] })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('an event still leaves when the clock lags its timer', () => {
    vi.useFakeTimers({ now: 1000 })
    let lag = 0
    const store = createRewardStore(() => Date.now() - lag)
    store.push({ target: null, amounts: [5] })
    // The timer fires while a coarse or adjusted wall clock reads 1ms short of 1.6s.
    lag = 1
    vi.advanceTimersByTime(REWARD_LIFETIME_MS)
    expect(store.get()).toEqual([])
    vi.advanceTimersByTime(REWARD_LIFETIME_MS * 10)
    expect(store.get()).toEqual([])
  })
})
