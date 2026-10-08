import { describe, expect, test } from 'vitest'
import { type Area, areaDistance, clampToArea, insideArea } from './area'

const circle: Area = { minX: 2, maxX: 2, minZ: -1, maxZ: -1, round: 5 }
const box: Area = { minX: -5, maxX: 5, minZ: -2, maxZ: 2 }
const rounded: Area = { minX: 0, maxX: 4, minZ: 0, maxZ: 2, round: 1 }

describe('area', () => {
  test('a point box with a round is a circle', () => {
    expect(areaDistance(circle, { x: 2, z: -1 })).toBeCloseTo(-5)
    expect(areaDistance(circle, { x: 7, z: -1 })).toBeCloseTo(0)
    expect(areaDistance(circle, { x: 2 + 3, z: -1 + 4 })).toBeCloseTo(0)
    expect(areaDistance(circle, { x: 12, z: -1 })).toBeCloseTo(5)
    expect(insideArea(circle, { x: 5, z: 2 })).toBe(true)
    expect(insideArea(circle, { x: 6, z: 3 })).toBe(false)
  })

  test('a square-cornered box measures to its sides and corners', () => {
    expect(areaDistance(box, { x: 0, z: 0 })).toBeCloseTo(-2)
    expect(areaDistance(box, { x: 8, z: 0 })).toBeCloseTo(3)
    expect(areaDistance(box, { x: 8, z: 6 })).toBeCloseTo(5)
  })

  test('a rounded box is the box grown by its round', () => {
    expect(areaDistance(rounded, { x: 5, z: 1 })).toBeCloseTo(0)
    expect(areaDistance(rounded, { x: 4 + 3, z: 2 + 4 })).toBeCloseTo(4)
    expect(insideArea(rounded, { x: -0.9, z: 1 })).toBe(true)
    expect(insideArea(rounded, { x: -0.9, z: -0.9 })).toBe(false)
  })

  test('clampToArea leaves inside points alone and pulls outside ones to the nearest edge', () => {
    expect(clampToArea(circle, { x: 3, z: 0 })).toEqual({ x: 3, z: 0 })
    const c = clampToArea(circle, { x: 2 + 30, z: -1 + 40 })
    expect(c.x).toBeCloseTo(2 + 3)
    expect(c.z).toBeCloseTo(-1 + 4)
    // A square-cornered box clamps per axis, exactly as the old box clamp did.
    expect(clampToArea(box, { x: 9, z: -9 })).toEqual({ x: 5, z: -2 })
    expect(clampToArea(box, { x: 1, z: 1 })).toEqual({ x: 1, z: 1 })
    const r = clampToArea(rounded, { x: 7, z: 6 })
    expect(r.x).toBeCloseTo(4 + 0.6)
    expect(r.z).toBeCloseTo(2 + 0.8)
  })
})
