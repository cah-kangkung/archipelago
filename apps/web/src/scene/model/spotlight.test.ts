import { describe, expect, test } from 'vitest'
import { SPOTLIGHT_DESATURATE, SPOTLIGHT_DIM, SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import type { Area } from './area'
import {
  areaKey,
  dimHex,
  labelOpacity,
  SPOTLIGHT_OFF,
  sameSpotlight,
  spotlightAt,
  spotlightFor,
  spotlightLeg,
} from './spotlight'

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('spotlight', () => {
  test('a layer area lights at full strength; none is off', () => {
    expect(spotlightFor(a)).toEqual({ area: a, strength: 1 })
    expect(spotlightFor(null)).toEqual(SPOTLIGHT_OFF)
  })

  test('from off, the new area fades in where it is', () => {
    expect(spotlightLeg(SPOTLIGHT_OFF, spotlightFor(a))).toEqual({
      from: { area: a, strength: 0 },
      to: { area: a, strength: 1 },
    })
  })

  test('lit to lit slides the area at full strength', () => {
    const { from, to } = spotlightLeg(spotlightFor(a), spotlightFor(b))
    expect(from).toEqual({ area: a, strength: 1 })
    expect(to).toEqual({ area: b, strength: 1 })
    const mid = spotlightAt(from, to, 0.5)
    expect(mid.strength).toBe(1)
    expect(mid.area?.minX).toBeCloseTo(5)
    expect(mid.area?.round).toBeCloseTo(2.5)
  })

  test('to the archipelago it fades out in place, from wherever it had got to', () => {
    const half = { area: a, strength: 0.5 }
    const { from, to } = spotlightLeg(half, SPOTLIGHT_OFF)
    expect(from).toEqual(half)
    expect(to).toEqual({ area: a, strength: 0 })
    expect(spotlightAt(from, to, 0.5).strength).toBeCloseTo(0.25)
    expect(spotlightAt(from, to, 0)).toEqual(half)
    expect(spotlightAt(from, to, 1)).toEqual(to)
  })

  test('sameSpotlight and areaKey compare by value', () => {
    expect(sameSpotlight(spotlightFor({ ...a }), spotlightFor(a))).toBe(true)
    expect(sameSpotlight(spotlightFor(a), spotlightFor(b))).toBe(false)
    expect(sameSpotlight(SPOTLIGHT_OFF, { area: a, strength: 0 })).toBe(true)
    expect(areaKey({ ...a })).toBe(areaKey(a))
    expect(areaKey(a)).not.toBe(areaKey(b))
    expect(areaKey(null)).toBe('none')
  })

  test('dimHex greys and darkens like the shader, scaled by strength', () => {
    expect(dimHex('#4d96e0', 0)).toBe('#4d96e0')
    const grey = 0.299 * 0x4d + 0.587 * 0x96 + 0.114 * 0xe0
    const ch = (c: number) => Math.round((c + (grey - c) * SPOTLIGHT_DESATURATE) * SPOTLIGHT_DIM)
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    expect(dimHex('#4d96e0', 1)).toBe(`#${hex(ch(0x4d))}${hex(ch(0x96))}${hex(ch(0xe0))}`)
  })

  test('labels outside the area fade; inside, or with no area, they do not', () => {
    expect(labelOpacity(a, { x: 1, z: 1 })).toBe(1)
    expect(labelOpacity(a, { x: 9, z: 0 })).toBe(SPOTLIGHT_LABEL_OPACITY)
    expect(labelOpacity(null, { x: 99, z: 0 })).toBe(1)
  })
})
