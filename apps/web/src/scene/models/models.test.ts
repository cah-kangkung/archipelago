import { DECORATION_TYPES, LANDMARK_TYPES } from '@archipelago/shared'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { islandExtent } from '../model/hex-space'
import { scenePalette } from '../model/palette'
import { islandTerrain } from '../model/terrain'
import { landmarkSegments } from './landmarks'
import { SCENERY_KINDS, sceneryGeometry } from './scenery'
import { foamGeometry, SEA_KINDS, seaGeometry } from './sea-props'
import { MODEL_KINDS, modelGeometry } from './structures'
import { islandGeometry } from './terrain-geometry'

const FOOTPRINT = 0.85 // just inside a hex's inradius (√3/2)
const allowed = Object.values(scenePalette).map((hex) => new THREE.Color(hex))

function expectPaletteColoured(g: THREE.BufferGeometry) {
  const position = g.getAttribute('position')
  const color = g.getAttribute('color')
  expect(position.count).toBeGreaterThan(0)
  expect(color.count).toBe(position.count)
  for (let i = 0; i < color.count; i++) {
    const c = new THREE.Color(color.getX(i), color.getY(i), color.getZ(i))
    // Colours are stored as float32, so compare with a tolerance rather than exactly.
    const near = (a: THREE.Color) =>
      Math.abs(a.r - c.r) < 1e-6 && Math.abs(a.g - c.g) < 1e-6 && Math.abs(a.b - c.b) < 1e-6
    expect(allowed.some(near)).toBe(true)
  }
}

function expectInsideFootprint(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  const box = g.boundingBox ?? new THREE.Box3()
  expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
  for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
    expect(Math.abs(v)).toBeLessThanOrEqual(FOOTPRINT)
  }
}

describe('structure models', () => {
  test.each(MODEL_KINDS)('%s is non-empty and palette-coloured', (kind) => {
    expectPaletteColoured(modelGeometry(kind))
  })

  test.each(MODEL_KINDS.filter((k) => k !== 'jib'))('%s stays on its hex', (kind) => {
    expectInsideFootprint(modelGeometry(kind))
  })

  test('geometries are cached and shared', () => {
    expect(modelGeometry('house')).toBe(modelGeometry('house'))
  })

  test('done buildings grow with size', () => {
    const footprint = (k: 'hut' | 'house' | 'workshop') => {
      const g = modelGeometry(k)
      g.computeBoundingBox()
      const b = g.boundingBox ?? new THREE.Box3()
      return (b.max.x - b.min.x) * (b.max.z - b.min.z)
    }
    expect(footprint('hut')).toBeLessThan(footprint('house'))
    expect(footprint('house')).toBeLessThan(footprint('workshop'))
  })
})

describe('landmarks', () => {
  test.each([...LANDMARK_TYPES])('%s has at least three coloured segments on its hex', (type) => {
    const segments = landmarkSegments(type)
    expect(segments.length).toBeGreaterThanOrEqual(3)
    for (const s of segments) {
      expectPaletteColoured(s)
      expectInsideFootprint(s)
    }
  })
})

describe('islandGeometry', () => {
  test('merges every tile plus a shallows hexagon, within the shallows extent', () => {
    const tiles = islandTerrain(5, 4)
    const g = islandGeometry(tiles, 4)
    expectPaletteColoured(g)
    g.computeBoundingBox()
    const limit = islandExtent(4) + 1.2 + 1e-6
    expect(g.boundingBox?.max.x).toBeLessThanOrEqual(limit)
    expect(g.boundingBox?.min.z).toBeGreaterThanOrEqual(-limit)
    g.dispose()
  })
})

describe('decoration models', () => {
  test.each(DECORATION_TYPES)(
    '%s stays within 0.6 of the plot centre, so any turn fits the hex',
    (type) => {
      const g = modelGeometry(type)
      g.computeBoundingBox()
      const box = g.boundingBox ?? new THREE.Box3()
      for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
        expect(Math.abs(v)).toBeLessThanOrEqual(0.6)
      }
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
    },
  )
})

describe('sea props', () => {
  test.each(SEA_KINDS)('%s is non-empty and palette-coloured', (kind) => {
    expectPaletteColoured(seaGeometry(kind))
  })

  test('foam rings are palette-coloured, one ring per shore', () => {
    const one = foamGeometry([{ origin: { x: 0, z: 0 }, radius: 4 }])
    const two = foamGeometry([
      { origin: { x: 0, z: 0 }, radius: 4 },
      { origin: { x: 30, z: 0 }, radius: 4 },
    ])
    expectPaletteColoured(two)
    expect(two.getAttribute('position').count).toBe(one.getAttribute('position').count * 2)
  })
})

describe('scenery models', () => {
  const triangles = (g: THREE.BufferGeometry) =>
    (g.index ? g.index.count : g.getAttribute('position').count) / 3
  const height = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox()
    const b = g.boundingBox ?? new THREE.Box3()
    return b.max.y - b.min.y
  }

  test.each(SCENERY_KINDS)('%s is palette-coloured and cached', (kind) => {
    expectPaletteColoured(sceneryGeometry(kind))
    expect(sceneryGeometry(kind)).toBe(sceneryGeometry(kind))
  })

  test.each(SCENERY_KINDS.filter((k) => k !== 'dock'))('%s is small and light', (kind) => {
    const g = sceneryGeometry(kind)
    g.computeBoundingBox()
    const box = g.boundingBox ?? new THREE.Box3()
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
    for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
      // A cluster offset of 0.55 plus this stays inside the hex at the largest scale (1.2).
      expect(Math.abs(v) * 1.2).toBeLessThanOrEqual(0.3)
    }
    expect(triangles(g)).toBeGreaterThanOrEqual(12)
    expect(triangles(g)).toBeLessThanOrEqual(40)
  })

  test('the tallest scenery tree stays under 0.6 of the shop pine', () => {
    expect(height(sceneryGeometry('tree')) * 1.2).toBeLessThanOrEqual(
      0.6 * height(modelGeometry('pine')),
    )
  })

  test('the dock reaches out along +x from its shore hex', () => {
    const g = sceneryGeometry('dock')
    g.computeBoundingBox()
    const box = g.boundingBox ?? new THREE.Box3()
    expect(box.max.x).toBeGreaterThan(1)
    expect(box.min.x).toBeGreaterThanOrEqual(-0.1)
  })
})
