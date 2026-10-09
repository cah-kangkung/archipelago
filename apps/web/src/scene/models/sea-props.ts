import * as THREE from 'three'
import type { Shore } from '../model/sea-depth'
import type { ScatterType } from '../model/sea-scatter'
import type { RimSide } from '../model/terrain'
import { FOAM_WIDTH } from '../tuning'
import { box, cone, merge, part, prism } from './build'
import { decorationBuilders } from './decorations'
import { SEA_LEVEL } from './terrain-geometry'

export type SeaKind = ScatterType | 'boat' | 'gull' | 'whale' | 'splash'
export const SEA_KINDS: readonly SeaKind[] = [
  'rock',
  'islet',
  'sandbar',
  'buoy',
  'boat',
  'gull',
  'whale',
  'splash',
]

const flatRing = (inner: number, outer: number, sides: number) =>
  new THREE.RingGeometry(inner, outer, sides).rotateX(-Math.PI / 2)

/** Base on y=0 at sea level; boats, gulls and the whale face +x. */
const builders: Record<SeaKind, () => THREE.BufferGeometry[]> = {
  rock: () => [
    part(prism(0.25, 0.45, 0.35, 5), 'rock'),
    part(prism(0.12, 0.2, 0.22, 5), 'stone', [0.3, 0, 0.15]),
  ],
  islet: () => [
    part(prism(0.7, 0.8, 0.2), 'shore'),
    part(prism(0.45, 0.6, 0.15), 'grass', [0, 0.2, 0]),
    ...decorationBuilders.palm().map((g) => g.translate(0, 0.35, 0)),
  ],
  sandbar: () => [part(prism(0.55, 0.75, 0.08).scale(1, 1, 0.5), 'shore')],
  buoy: () => [
    part(prism(0.08, 0.12, 0.35), 'buoy'),
    part(cone(0.1, 0.15, 6), 'foam', [0, 0.35, 0]),
  ],
  boat: () => [
    part(box(0.7, 0.16, 0.28), 'woodDark'),
    part(box(0.04, 0.6, 0.04), 'wood', [0, 0.16, 0]),
    part(cone(0.22, 0.45, 3), 'foam', [0.06, 0.24, 0]),
  ],
  gull: () => [
    part(box(0.12, 0.06, 0.06), 'foam'),
    part(box(0.06, 0.02, 0.44), 'foam', [0, 0.04, 0]),
  ],
  whale: () => [
    part(box(1.2, 0.35, 0.4), 'whale', [0, -0.175, 0]),
    part(box(0.12, 0.08, 0.5), 'whale', [-0.65, 0, 0]),
  ],
  splash: () => [part(flatRing(0.3, 0.6, 12), 'foam')],
}

const cache = new Map<SeaKind, THREE.BufferGeometry>()

/** Shared per kind; never disposed. */
export function seaGeometry(kind: SeaKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}

/** A flat foam strip just outside one rim side, wound so its normal points up. */
function foamStrip(s: RimSide): THREE.BufferGeometry {
  const w = FOAM_WIDTH
  const a2 = { x: s.a.x + s.out.x * w, z: s.a.z + s.out.z * w }
  const b2 = { x: s.b.x + s.out.x * w, z: s.b.z + s.out.z * w }
  const g = new THREE.BufferGeometry()
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        s.a.x,
        0,
        s.a.z,
        s.b.x,
        0,
        s.b.z,
        b2.x,
        0,
        b2.z,
        s.a.x,
        0,
        s.a.z,
        b2.x,
        0,
        b2.z,
        a2.x,
        0,
        a2.z,
      ],
      3,
    ),
  )
  g.computeVertexNormals()
  return g
}

/**
 * Foam along every island's rim (spec 24.4): a strip per shallows side facing open water,
 * merged into one mesh. Caller disposes.
 */
export function foamGeometry(
  shores: readonly Pick<Shore, 'origin' | 'rim'>[],
): THREE.BufferGeometry {
  return merge(
    shores.flatMap((s) =>
      s.rim.map((side) =>
        part(foamStrip(side), 'foam', [s.origin.x, SEA_LEVEL + 0.06, s.origin.z]),
      ),
    ),
  )
}
