import * as THREE from 'three'
import type { RingPoint } from '../model/district-ring'
import { DISTRICT_RING_INSET, DISTRICT_RING_LIFT, DISTRICT_RING_WIDTH } from '../tuning'

/**
 * The district ring's ribbon (spec 24.5): per loop point, a vertex at the inset and one a width
 * further in along its mitre, lifted off the tiles; the first point repeats at the end so
 * `aAlong` (0 → 1 along each loop) can reveal it. Height steps become vertical strips because
 * both of a corner's points share its mitre. Caller disposes.
 */
export function ringGeometry(loops: readonly (readonly RingPoint[])[]): THREE.BufferGeometry {
  const positions: number[] = []
  const along: number[] = []
  const index: number[] = []
  for (const loop of loops) {
    const n = loop.length
    const lengths = [0]
    for (let i = 1; i <= n; i++) {
      const a = loop[i - 1] as RingPoint
      const b = loop[i % n] as RingPoint
      lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    }
    const total = lengths[n] || 1
    const base = positions.length / 3
    for (let i = 0; i <= n; i++) {
      const p = loop[i % n] as RingPoint
      for (const reach of [DISTRICT_RING_INSET, DISTRICT_RING_INSET + DISTRICT_RING_WIDTH]) {
        positions.push(p.x + p.mx * reach, p.y + DISTRICT_RING_LIFT, p.z + p.mz * reach)
        along.push((lengths[i] ?? 0) / total)
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}
