/** Short-lived reward effects, handed from mutations to the scene without React state. */
export type RewardTarget = { kind: 'task' | 'building'; id: string }
export type RewardEvent = {
  id: number
  target: RewardTarget | null
  amounts: readonly number[]
  /** `Date.now()` when pushed. */
  at: number
}
export type RewardInput = Pick<RewardEvent, 'target' | 'amounts'>

export const REWARD_LIFETIME_MS = 1600

export type RewardStore = {
  get: () => readonly RewardEvent[]
  push: (input: RewardInput) => RewardEvent
  subscribe: (listener: () => void) => () => void
}

export function createRewardStore(now: () => number = () => Date.now()): RewardStore {
  let events: readonly RewardEvent[] = []
  let nextId = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  // Each event leaves by id on its own timer: comparing wall-clock ages could miss by a
  // millisecond and leave an event (and the ticker) alive with no timer left to remove it.
  const expire = (id: number) => {
    const alive = events.filter((e) => e.id !== id)
    if (alive.length === events.length) return
    events = alive
    notify()
  }
  return {
    get: () => events,
    push(input) {
      const event: RewardEvent = { ...input, id: ++nextId, at: now() }
      events = [...events, event]
      setTimeout(() => expire(event.id), REWARD_LIFETIME_MS)
      notify()
      return event
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
