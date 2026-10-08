import type { Quality } from './model/quality'

/** What the `?perf` overlay shows; written by the render loop, read by the DOM. */
export type PerfReading = {
  fps: number
  calls: number
  triangles: number
  dpr: number
  tier: Quality
}

export type PerfStore = {
  get: () => PerfReading | null
  set: (next: PerfReading) => void
  subscribe: (listener: () => void) => () => void
}

const same = (a: PerfReading, b: PerfReading) =>
  a.fps === b.fps &&
  a.calls === b.calls &&
  a.triangles === b.triangles &&
  a.dpr === b.dpr &&
  a.tier === b.tier

export function createPerfStore(): PerfStore {
  let current: PerfReading | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next) {
      if (current && same(current, next)) return
      current = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
