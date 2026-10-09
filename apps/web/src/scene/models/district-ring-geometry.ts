import * as THREE from 'three'
import type { RingPoint } from '../model/district-ring'
import { DISTRICT_RING_INSET, DISTRICT_RING_LIFT, DISTRICT_RING_WIDTH } from '../tuning'

/**
 * The district ring's ribbon (spec 24.5): per loop point, a vertex at the inset and one a width
 * further in along its mitre, lifted off the tiles; the last segment closes back onto the first
 * point. Height steps become vertical strips because both of a corner's points share its mitre.
 * Caller disposes.
 */
export function ringGeometry(loops: readonly (readonly RingPoint[])[]): THREE.BufferGeometry {
  const positions: number[] = []
  const index: number[] = []
  for (const loop of loops) {
    const n = loop.length
    const base = positions.length / 3
    for (const p of loop) {
      for (const reach of [DISTRICT_RING_INSET, DISTRICT_RING_INSET + DISTRICT_RING_WIDTH]) {
        positions.push(p.x + p.mx * reach, p.y + DISTRICT_RING_LIFT, p.z + p.mz * reach)
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2
      const b = base + ((i + 1) % n) * 2
      index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}
