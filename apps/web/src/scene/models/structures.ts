import * as THREE from 'three'
import { STRUCTURE_KINDS, type StructureKind } from '../model/state'
import { box, cone, merge, part, prism } from './build'

export type ModelKind = StructureKind | 'jib' | 'storm' | 'lantern' | 'shadow' | 'selection'
export const MODEL_KINDS: readonly ModelKind[] = [
  ...STRUCTURE_KINDS,
  'jib',
  'storm',
  'lantern',
  'shadow',
  'selection',
]

/** The crane mast's top, relative to the plot centre's ground: the jib turns about this point. */
export const JIB_PIVOT = [0.4, 1.3, -0.4] as const

const quarter = Math.PI / 4

const scaffold = () => [
  part(box(0.72, 0.05, 0.72), 'plaza'),
  ...[-0.3, 0.3].flatMap((x) =>
    [-0.3, 0.3].map((z) => part(box(0.06, 0.72, 0.06), 'wood', [x, 0, z])),
  ),
  ...[0.36, 0.68].flatMap((y) => [
    part(box(0.66, 0.05, 0.05), 'woodDark', [0, y, -0.3]),
    part(box(0.66, 0.05, 0.05), 'woodDark', [0, y, 0.3]),
    part(box(0.05, 0.05, 0.66), 'woodDark', [-0.3, y, 0]),
    part(box(0.05, 0.05, 0.66), 'woodDark', [0.3, y, 0]),
  ]),
]

const builders: Record<ModelKind, () => THREE.BufferGeometry[]> = {
  scaffold,
  crane: () => [
    ...scaffold(),
    part(box(0.08, JIB_PIVOT[1], 0.08), 'stone', [JIB_PIVOT[0], 0, JIB_PIVOT[2]]),
  ],
  jib: () => [
    part(box(0.9, 0.06, 0.06), 'wood', [0.25, 0, 0]),
    part(box(0.14, 0.12, 0.12), 'stone', [-0.22, -0.12, 0]),
    part(box(0.02, 0.4, 0.02), 'stone', [0.6, -0.4, 0]),
  ],
  hut: () => [
    part(box(0.5, 0.35, 0.5), 'wall'),
    part(cone(0.45, 0.35, 4), 'wood', [0, 0.35, 0], quarter),
  ],
  house: () => [
    part(box(0.7, 0.5, 0.6), 'wall'),
    part(cone(0.6, 0.4, 4), 'roof', [0, 0.5, 0], quarter),
    part(box(0.1, 0.25, 0.1), 'stone', [0.2, 0.6, 0.12]),
    part(box(0.16, 0.28, 0.02), 'woodDark', [0, 0, 0.31]),
  ],
  workshop: () => [
    part(box(0.9, 0.55, 0.75), 'wall'),
    part(box(0.96, 0.12, 0.8), 'roofDark', [0, 0.55, 0]),
    part(prism(0.08, 0.08, 0.5), 'stone', [0.3, 0.67, -0.2]),
    part(box(0.24, 0.32, 0.02), 'woodDark', [0, 0, 0.38]),
  ],
  storm: () => [
    part(new THREE.IcosahedronGeometry(0.24, 0), 'storm', [0, 1.55, 0]),
    part(new THREE.IcosahedronGeometry(0.18, 0), 'storm', [0.2, 1.5, 0.05]),
    part(new THREE.IcosahedronGeometry(0.18, 0), 'storm', [-0.2, 1.5, -0.05]),
  ],
  lantern: () => [
    part(box(0.04, 0.5, 0.04), 'woodDark', [-0.4, 0, 0.35]),
    part(box(0.12, 0.14, 0.12), 'glow', [-0.4, 0.5, 0.35]),
  ],
  shadow: () => [
    part(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), 'shadow', [0, 0.01, 0]),
  ],
  // Six segments put the ring's corners on the hex's corners once turned 30°.
  selection: () => [
    part(
      new THREE.RingGeometry(0.62, 0.72, 6).rotateX(-Math.PI / 2),
      'selection',
      [0, 0.02, 0],
      Math.PI / 6,
    ),
  ],
}

const cache = new Map<ModelKind, THREE.BufferGeometry>()

/** One merged, vertex-coloured geometry per kind, built on first use and shared by every instance. */
export function modelGeometry(kind: ModelKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}
