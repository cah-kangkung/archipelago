import { afterEach, describe, expect, test } from 'vitest'
import { noBlurEnabled, perfEnabled, resetNoBlurFlag, resetPerfFlag } from './perf-flag'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  resetPerfFlag()
})

const at = (search: string) => {
  window.history.replaceState(null, '', `/${search}`)
  resetPerfFlag()
  return perfEnabled()
}

describe('perfEnabled', () => {
  test('is on for a perf parameter, alone or among others', () => {
    expect(at('?perf')).toBe(true)
    expect(at('?perf=1')).toBe(true)
    expect(at('?x=1&perf')).toBe(true)
  })

  test('is off without it, including for look-alikes', () => {
    expect(at('')).toBe(false)
    expect(at('?perform')).toBe(false)
    expect(at('?x=perf')).toBe(false)
  })

  test('is read once per page load', () => {
    expect(at('?perf')).toBe(true)
    window.history.replaceState(null, '', '/')
    expect(perfEnabled()).toBe(true)
  })
})

describe('noBlurEnabled', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    resetNoBlurFlag()
  })

  test('is false without ?noblur', () => {
    expect(noBlurEnabled()).toBe(false)
  })

  test('reads ?noblur, alone or beside ?perf', () => {
    window.history.replaceState(null, '', '/?perf&noblur')
    expect(noBlurEnabled()).toBe(true)
  })
})
