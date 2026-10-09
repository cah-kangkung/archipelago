import { describe, expect, test } from 'vitest'
import { SPOTLIGHT_LABEL_OPACITY } from '../tuning'
import type { Area } from './area'
import { areaKey, labelOpacity } from './spotlight'

const a: Area = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, round: 4 }
const b: Area = { minX: 10, maxX: 12, minZ: 2, maxZ: 2, round: 1 }

describe('spotlight', () => {
  test('areaKey compares by value', () => {
    expect(areaKey({ ...a })).toBe(areaKey(a))
    expect(areaKey(a)).not.toBe(areaKey(b))
    expect(areaKey(null)).toBe('none')
  })

  test('labels outside the area fade; inside, or with no area, they do not', () => {
    expect(labelOpacity(a, { x: 1, z: 1 })).toBe(1)
    expect(labelOpacity(a, { x: 9, z: 0 })).toBe(SPOTLIGHT_LABEL_OPACITY)
    expect(labelOpacity(null, { x: 99, z: 0 })).toBe(1)
  })
})
