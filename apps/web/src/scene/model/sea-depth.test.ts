import { describe, expect, test } from 'vitest'
import { SEA_DEEP_DISTANCE } from '../tuning'
import { shallowsRadius } from './hex-space'
import { depthShade, shoreDistance, UNCHARTED_RADIUS } from './sea-depth'

const a = { origin: { x: 0, z: 0 }, radius: 4 }
const b = { origin: { x: 40, z: 0 }, radius: 4 }

describe('sea depth', () => {
  test('distance runs to the nearest shallows edge and is 0 inside one', () => {
    expect(shoreDistance({ x: 0, z: 0 }, [a, b])).toBe(0)
    expect(shoreDistance({ x: shallowsRadius(4) + 3, z: 0 }, [a, b])).toBeCloseTo(3)
    expect(shoreDistance({ x: 40 - shallowsRadius(4) - 2, z: 0 }, [a, b])).toBeCloseTo(2)
  })

  test('an empty world measures from the uncharted island at the origin', () => {
    expect(shoreDistance({ x: shallowsRadius(UNCHARTED_RADIUS) + 5, z: 0 }, [])).toBeCloseTo(5)
  })

  test('shade runs from 0 at the shallows to 1 at the deep distance, then stays', () => {
    expect(depthShade(0)).toBe(0)
    expect(depthShade(SEA_DEEP_DISTANCE / 2)).toBeCloseTo(0.5)
    expect(depthShade(SEA_DEEP_DISTANCE * 3)).toBe(1)
  })
})
