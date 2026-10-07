import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { seaMaterial } from './materials'
import type { Bounds } from './model/scene-model'
import { SEA_LEVEL } from './models/terrain-geometry'
import { onTap } from './tap'

/** Open water beyond the outermost island, in world units. */
const SEA_MARGIN = 60
const WAVE_HEIGHT = 0.05

export function Sea({
  bounds,
  animate,
  onTapSea,
}: {
  bounds: Bounds
  animate: boolean
  onTapSea: () => void
}) {
  const { minX, maxX, minZ, maxZ } = bounds
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      maxX - minX + SEA_MARGIN * 2,
      maxZ - minZ + SEA_MARGIN * 2,
      48,
      48,
    )
    g.rotateX(-Math.PI / 2)
    g.translate((minX + maxX) / 2, SEA_LEVEL, (minZ + maxZ) / 2)
    return g
  }, [minX, maxX, minZ, maxZ])
  const rest = useMemo(() => Float32Array.from(geometry.getAttribute('position').array), [geometry])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    if (!animate) return
    const position = geometry.getAttribute('position')
    const t = clock.elapsedTime
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3] ?? 0
      const z = rest[i * 3 + 2] ?? 0
      position.setY(
        i,
        SEA_LEVEL + WAVE_HEIGHT * Math.sin(x * 0.6 + t) * Math.cos(z * 0.6 + t * 0.8),
      )
    }
    position.needsUpdate = true
  })

  return (
    <mesh
      name="sea"
      geometry={geometry}
      material={seaMaterial}
      onClick={onTap<MouseEvent>(onTapSea)}
    />
  )
}
