import { describe, expect, test } from 'vitest'
import { FOG_DEPTH, FOG_MARGIN } from '../tuning'
import { fogRange, viewDepth } from './horizon'

const ISO = 200
const bounds = { minX: -20, maxX: 30, minZ: -10, maxZ: 25 }
const cameraOver = (x: number, z: number) => ({ x: x + ISO, y: ISO, z: z + ISO })
const corners = [
  { x: bounds.minX, y: 0, z: bounds.minZ },
  { x: bounds.minX, y: 0, z: bounds.maxZ },
  { x: bounds.maxX, y: 0, z: bounds.minZ },
  { x: bounds.maxX, y: 0, z: bounds.maxZ },
]

describe('fogRange', () => {
  test('the camera target sits at the iso distance', () => {
    expect(viewDepth(cameraOver(0, 0), { x: 0, y: 0, z: 0 })).toBeCloseTo(ISO * Math.sqrt(3))
  })

  test('starts FOG_MARGIN past the farthest corner and is solid FOG_DEPTH later', () => {
    const camera = cameraOver(5, 5)
    const { near, far } = fogRange(camera, bounds)
    const deepest = Math.max(...corners.map((c) => viewDepth(camera, c)))
    expect(near).toBeCloseTo(deepest + FOG_MARGIN)
    expect(far).toBeCloseTo(near + FOG_DEPTH)
  })

  test('after any pan no island corner, at any height, is fogged', () => {
    for (const [x, z] of [
      [0, 0],
      [-40, 10],
      [60, -30],
    ] as const) {
      const camera = cameraOver(x, z)
      const { near } = fogRange(camera, bounds)
      for (const c of corners) {
        for (const y of [0, 1, 3]) expect(viewDepth(camera, { ...c, y })).toBeLessThan(near)
      }
    }
  })
})
