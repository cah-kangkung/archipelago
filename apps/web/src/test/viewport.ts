import { afterEach } from 'vitest'

let desktop = false
let reducedMotion = false
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

/** jsdom has no matchMedia; this mock answers `(min-width: 1024px)` from a test-controlled flag. */
export function setDesktop(value: boolean): void {
  desktop = value
  notify()
}

/** Answers `(prefers-reduced-motion: reduce)`. */
export function setReducedMotion(value: boolean): void {
  reducedMotion = value
  notify()
}

const answer = (query: string) => {
  if (query.includes('min-width: 1024px')) return desktop
  if (query.includes('prefers-reduced-motion: reduce')) return reducedMotion
  return false
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    get matches() {
      return answer(query)
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.add(listener as () => void)
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.delete(listener as () => void)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  desktop = false
  reducedMotion = false
})
