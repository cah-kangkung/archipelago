import { afterEach, describe, expect, test, vi } from 'vitest'
import { hasWebGL, resetWebGLProbe } from './webgl'

afterEach(() => {
  vi.restoreAllMocks()
  resetWebGLProbe()
})

describe('hasWebGL', () => {
  test('is false when no context can be created (jsdom)', () => {
    expect(hasWebGL()).toBe(false)
  })

  test('is true when a webgl2 context exists, and probes only once', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as RenderingContext)
    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(getContext).toHaveBeenCalledTimes(1)
  })

  test('is false when probing throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasWebGL()).toBe(false)
  })
})
