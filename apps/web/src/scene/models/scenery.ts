import type * as THREE from 'three'
import { SCENERY_TYPES, type SceneryType } from '../model/island-growth'
import { box, cone, merge, part, prism } from './build'

export type SceneryKind = SceneryType | 'dock'
export const SCENERY_KINDS: readonly SceneryKind[] = [...SCENERY_TYPES, 'dock']

/**
 * Small, muted pieces with their base on y=0, centred on x/z (spec 18.2). The tree stays well
 * under the shop pine; the dock's deck runs along +x from the shore hex's centre.
 */
const builders: Record<SceneryKind, () => THREE.BufferGeometry[]> = {
  tree: () => [
    part(prism(0.03, 0.04, 0.12, 5), 'woodDark'),
    part(cone(0.15, 0.24, 5), 'foliage', [0, 0.1, 0]),
  ],
  bush: () => [
    part(prism(0.09, 0.13, 0.12, 5), 'foliage'),
    part(prism(0.05, 0.08, 0.08, 5), 'foliage', [0.1, 0, 0.06]),
  ],
  rock: () => [part(prism(0.08, 0.14, 0.12, 5), 'rock')],
  flowers: () => [
    part(box(0.03, 0.08, 0.03), 'foliage'),
    part(box(0.07, 0.03, 0.07), 'petal', [0, 0.08, 0]),
    part(box(0.06, 0.03, 0.06), 'petal', [0.09, 0, 0.05]),
  ],
  grass: () => [
    part(cone(0.03, 0.16, 3), 'foliageDry'),
    part(cone(0.03, 0.12, 3), 'foliageDry', [0.05, 0, 0.03]),
    part(cone(0.03, 0.14, 3), 'foliageDry', [-0.04, 0, 0.04]),
  ],
  reeds: () => [
    part(cone(0.02, 0.26, 3), 'foliage'),
    part(cone(0.02, 0.2, 3), 'foliage', [0.05, 0, -0.03]),
    part(cone(0.02, 0.23, 3), 'foliage', [-0.04, 0, 0.04]),
  ],
  driftwood: () => [
    part(box(0.3, 0.05, 0.06), 'driftwood'),
    part(box(0.14, 0.04, 0.05), 'driftwood', [0.06, 0.03, 0.05], 0.6),
  ],
  dock: () => [
    part(box(1.4, 0.06, 0.4), 'wood', [0.7, 0, 0]),
    ...[0.5, 1.3].flatMap((x) =>
      [-0.15, 0.15].map((z) => part(box(0.06, 0.8, 0.06), 'woodDark', [x, -0.8, z])),
    ),
  ],
}

const cache = new Map<SceneryKind, THREE.BufferGeometry>()

/** Shared per kind; never disposed. */
export function sceneryGeometry(kind: SceneryKind): THREE.BufferGeometry {
  let geometry = cache.get(kind)
  if (!geometry) {
    geometry = merge(builders[kind]())
    cache.set(kind, geometry)
  }
  return geometry
}
