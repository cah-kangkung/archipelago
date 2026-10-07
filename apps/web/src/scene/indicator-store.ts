import type { EdgeIndicator } from './model/indicators'

/** Hands edge markers from the render loop to the DOM without re-rendering the scene each frame. */
export type IndicatorStore = {
  get: () => readonly EdgeIndicator[]
  set: (next: readonly EdgeIndicator[]) => void
  subscribe: (listener: () => void) => () => void
}

export function createIndicatorStore(): IndicatorStore {
  let current: readonly EdgeIndicator[] = []
  let key = '[]'
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next) {
      const nextKey = JSON.stringify(next)
      if (nextKey === key) return
      key = nextKey
      current = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
