import { afterEach } from 'vitest'

let desktop = false

/** jsdom has no matchMedia; this mock answers `(min-width: 1024px)` from a test-controlled flag. */
export function setDesktop(value: boolean): void {
  desktop = value
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: query.includes('min-width: 1024px') ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  desktop = false
})
