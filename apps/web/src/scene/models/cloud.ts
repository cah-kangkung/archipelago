import * as THREE from 'three'
import { merge, part } from './build'

let cached: THREE.BufferGeometry | null = null

/** One puff: four flat-shaded blobs, base near y=0, about 1.6 wide (spec 21.2). Shared, never disposed. */
export function cloudGeometry(): THREE.BufferGeometry {
  cached ??= merge([
    part(new THREE.IcosahedronGeometry(0.55, 0), 'cloud', [0, 0.45, 0]),
    part(new THREE.IcosahedronGeometry(0.4, 0), 'cloud', [0.5, 0.3, 0.1]),
    part(new THREE.IcosahedronGeometry(0.38, 0), 'cloud', [-0.45, 0.3, -0.1]),
    part(new THREE.IcosahedronGeometry(0.3, 0), 'cloud', [0.1, 0.25, 0.45]),
  ])
  return cached
}
