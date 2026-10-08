import type { DecorationType } from '@archipelago/shared'
import * as THREE from 'three'
import { box, cone, part, prism } from './build'

const leaf = (i: number) => (i * 2 * Math.PI) / 5

/** Low-poly decorations; every part stays within 0.6 of the centre so a turn never leaves the hex. */
export const decorationBuilders: Record<DecorationType, () => THREE.BufferGeometry[]> = {
  pine: () => [
    part(prism(0.05, 0.07, 0.2), 'woodDark'),
    part(cone(0.32, 0.45, 6), 'grass', [0, 0.2, 0]),
    part(cone(0.24, 0.35, 6), 'meadow', [0, 0.5, 0]),
  ],
  palm: () => [
    part(prism(0.04, 0.06, 0.7), 'wood'),
    ...[0, 1, 2, 3, 4].map((i) =>
      part(
        box(0.36, 0.03, 0.1),
        'grass',
        [Math.cos(leaf(i)) * 0.18, 0.68, -Math.sin(leaf(i)) * 0.18],
        leaf(i),
      ),
    ),
  ],
  garden: () => [
    part(box(0.7, 0.08, 0.7), 'woodDark'),
    part(box(0.62, 0.05, 0.62), 'grass', [0, 0.08, 0]),
    ...[
      [-0.18, -0.18],
      [0.18, -0.15],
      [0, 0.12],
      [-0.2, 0.2],
      [0.2, 0.2],
    ].map(([x = 0, z = 0]) => part(box(0.1, 0.1, 0.1), 'glow', [x, 0.13, z])),
  ],
  lamp: () => [
    part(box(0.5, 0.05, 0.16), 'wood', [-0.05, 0.18, 0.1]),
    part(box(0.5, 0.16, 0.04), 'wood', [-0.05, 0.2, 0.2]),
    part(box(0.04, 0.18, 0.12), 'woodDark', [-0.26, 0, 0.1]),
    part(box(0.04, 0.18, 0.12), 'woodDark', [0.16, 0, 0.1]),
    part(box(0.04, 0.7, 0.04), 'stone', [0.3, 0, -0.2]),
    part(box(0.12, 0.12, 0.12), 'glow', [0.3, 0.7, -0.2]),
  ],
  well: () => [
    part(prism(0.3, 0.32, 0.3, 8), 'stone'),
    part(prism(0.24, 0.24, 0.02, 8), 'shallows', [0, 0.3, 0]),
    part(box(0.05, 0.5, 0.05), 'woodDark', [-0.26, 0.3, 0]),
    part(box(0.05, 0.5, 0.05), 'woodDark', [0.26, 0.3, 0]),
    part(cone(0.4, 0.22, 4), 'roof', [0, 0.78, 0], Math.PI / 4),
  ],
  stall: () => [
    part(box(0.7, 0.32, 0.36), 'wall', [0, 0, 0.1]),
    part(box(0.7, 0.04, 0.4), 'wood', [0, 0.32, 0.1]),
    ...[-0.32, 0.32].map((x) => part(box(0.04, 0.7, 0.04), 'woodDark', [x, 0, -0.18])),
    part(box(0.8, 0.05, 0.6), 'roof', [0, 0.7, 0]),
  ],
  fountain: () => [
    part(prism(0.5, 0.52, 0.18, 8), 'stone'),
    part(prism(0.44, 0.44, 0.02, 8), 'shallows', [0, 0.18, 0]),
    part(prism(0.07, 0.09, 0.45, 6), 'stone', [0, 0.18, 0]),
    part(prism(0.2, 0.08, 0.08, 8), 'stone', [0, 0.6, 0]),
    part(prism(0.16, 0.16, 0.02, 8), 'shallows', [0, 0.68, 0]),
  ],
  statue: () => [
    part(box(0.44, 0.24, 0.44), 'stone'),
    part(prism(0.12, 0.15, 0.5, 6), 'plaza', [0, 0.24, 0]),
    part(new THREE.IcosahedronGeometry(0.11, 0), 'plaza', [0, 0.85, 0]),
    part(box(0.36, 0.06, 0.06), 'plaza', [0, 0.62, 0]),
  ],
}
