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

  test('is true when a webgl2 context exists, probes only once and releases the context', () => {
    const loseContext = vi.fn()
    const context = { getExtension: () => ({ loseContext }) } as unknown as RenderingContext
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(getContext).toHaveBeenCalledWith('webgl2')
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  test('is false on a WebGL1-only device: three r186 needs WebGL2', () => {
    const context = { getExtension: () => null } as unknown as RenderingContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) =>
      id === 'webgl' ? context : null) as typeof HTMLCanvasElement.prototype.getContext)
    expect(hasWebGL()).toBe(false)
  })

  test('is false when probing throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasWebGL()).toBe(false)
  })
})
