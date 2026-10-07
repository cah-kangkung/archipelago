import type { LandmarkType } from '@archipelago/shared'
import * as THREE from 'three'
import { box, cone, merge, part, prism } from './build'

const quarter = Math.PI / 4

/** Each landmark is a stack of segments, bottom first; progress decides how many are solid. */
const recipes: Record<LandmarkType, () => THREE.BufferGeometry[][]> = {
  lighthouse: () => [
    [part(prism(0.42, 0.48, 0.3), 'stone')],
    [part(prism(0.3, 0.36, 0.6), 'wall', [0, 0.3, 0])],
    [part(prism(0.26, 0.3, 0.5), 'roof', [0, 0.9, 0])],
    [
      part(prism(0.24, 0.24, 0.25), 'glow', [0, 1.4, 0]),
      part(cone(0.3, 0.3, 6), 'roofDark', [0, 1.65, 0]),
    ],
  ],
  town_hall: () => [
    [part(box(1.1, 0.12, 0.9), 'plaza')],
    [
      part(box(1.0, 0.5, 0.8), 'wall', [0, 0.12, 0]),
      part(box(0.24, 0.32, 0.02), 'woodDark', [0, 0.12, 0.41]),
    ],
    [part(cone(0.75, 0.4, 4), 'roofDark', [0, 0.62, 0], quarter)],
    [
      part(box(0.28, 0.45, 0.28), 'wall', [0, 0.85, 0]),
      part(cone(0.24, 0.3, 4), 'roof', [0, 1.3, 0], quarter),
    ],
  ],
  windmill: () => [
    [part(prism(0.42, 0.5, 0.6), 'wall')],
    [part(prism(0.34, 0.42, 0.5), 'wall', [0, 0.6, 0])],
    [part(cone(0.42, 0.4, 6), 'roofDark', [0, 1.1, 0])],
    [
      part(box(1.1, 0.12, 0.03), 'wood', [0, 1.1, 0.45]),
      part(box(0.12, 1.1, 0.03), 'wood', [0, 0.55, 0.45]),
    ],
  ],
  observatory: () => [
    [part(prism(0.5, 0.56, 0.4), 'stone')],
    [part(prism(0.46, 0.46, 0.35), 'wall', [0, 0.4, 0])],
    [
      part(
        new THREE.SphereGeometry(0.46, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        'roof',
        [0, 0.75, 0],
      ),
      part(box(0.1, 0.1, 0.5), 'stone', [0, 1.05, 0.15]),
    ],
  ],
  market: () => [
    [part(box(1.2, 0.1, 1.0), 'plaza')],
    [
      part(box(0.4, 0.35, 0.3), 'wood', [-0.3, 0.1, 0.2]),
      part(box(0.4, 0.35, 0.3), 'wood', [0.3, 0.1, -0.2]),
    ],
    [
      part(box(0.5, 0.06, 0.4), 'roof', [-0.3, 0.45, 0.2]),
      part(box(0.5, 0.06, 0.4), 'wall', [0.3, 0.45, -0.2]),
      part(box(0.04, 0.8, 0.04), 'woodDark', [0.5, 0.1, 0.4]),
      part(box(0.2, 0.12, 0.02), 'roof', [0.4, 0.75, 0.4]),
    ],
  ],
}

const cache = new Map<LandmarkType, THREE.BufferGeometry[]>()

export function landmarkSegments(type: LandmarkType): THREE.BufferGeometry[] {
  let segments = cache.get(type)
  if (!segments) {
    segments = recipes[type]().map(merge)
    cache.set(type, segments)
  }
  return segments
}
