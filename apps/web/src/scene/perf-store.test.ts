import { describe, expect, test, vi } from 'vitest'
import { createPerfStore } from './perf-store'

describe('perf store', () => {
  test('starts empty and notifies only when the reading changes', () => {
    const store = createPerfStore()
    expect(store.get()).toBeNull()
    const listener = vi.fn()
    store.subscribe(listener)
    const reading = { fps: 30, calls: 40, triangles: 9000, dpr: 2, tier: 'high' as const }
    store.set(reading)
    store.set({ ...reading })
    expect(listener).toHaveBeenCalledTimes(1)
    store.set({ ...reading, fps: 29 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.get()).toEqual({ ...reading, fps: 29 })
  })
})
