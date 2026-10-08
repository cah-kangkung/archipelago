import { describe, expect, test } from 'vitest'
import { QUALITY_FLIPFLOPS } from '../tuning'
import { nextQuality, qualityDpr, START_QUALITY } from './quality'

describe('quality', () => {
  test('starts high; decline lowers, incline raises', () => {
    expect(START_QUALITY).toEqual({ tier: 'high', settled: false, changes: 0 })
    const low = nextQuality(START_QUALITY, 'decline')
    expect(low).toEqual({ tier: 'low', settled: false, changes: 1 })
    expect(nextQuality(low, 'incline')).toEqual({ tier: 'high', settled: false, changes: 2 })
  })

  test('a signal that keeps the tier changes nothing and never settles', () => {
    let high = START_QUALITY
    for (let i = 0; i < 10; i++) high = nextQuality(high, 'incline')
    expect(high).toBe(START_QUALITY)
    const low = nextQuality(START_QUALITY, 'decline')
    let still = low
    for (let i = 0; i < 10; i++) still = nextQuality(still, 'decline')
    expect(still).toBe(low)
  })

  test('three real changes settle on low for good: a later incline is ignored', () => {
    expect(QUALITY_FLIPFLOPS).toBe(3)
    const once = nextQuality(START_QUALITY, 'decline')
    const twice = nextQuality(once, 'incline')
    const settled = nextQuality(twice, 'decline')
    expect(settled).toEqual({ tier: 'low', settled: true, changes: 3 })
    expect(nextQuality(settled, 'incline')).toBe(settled)
    expect(nextQuality(settled, 'decline')).toBe(settled)
  })

  test('high allows up to 2× DPR; low draws at 1×', () => {
    expect(qualityDpr('high')).toEqual([1, 2])
    expect(qualityDpr('low')).toBe(1)
  })
})
