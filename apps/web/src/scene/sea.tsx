import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seaMaterial } from './materials'
import type { Bounds } from './model/scene-model'
import { SEA_LEVEL } from './models/terrain-geometry'
import { onTap } from './tap'
import { clampDelta, SEA_WAVE_HEIGHT, SEA_WAVE_SPEED } from './tuning'

/** Open water beyond the outermost island, in world units: enough to fill a desktop viewport at
 * archipelago zoom. */
const SEA_MARGIN = 250
/** Plane segments per side; the margin grew, so this keeps the wave's resolution. */
const SEA_SEGMENTS = 96

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
      SEA_SEGMENTS,
      SEA_SEGMENTS,
    )
    g.rotateX(-Math.PI / 2)
    g.translate((minX + maxX) / 2, SEA_LEVEL, (minZ + maxZ) / 2)
    return g
  }, [minX, maxX, minZ, maxZ])
  const rest = useMemo(() => Float32Array.from(geometry.getAttribute('position').array), [geometry])
  useEffect(() => () => geometry.dispose(), [geometry])
  const invalidate = useThree((s) => s.invalidate)
  // Low tier (or reduced motion): the wave stops flat at sea level; the shallows ring is terrain.
  useLayoutEffect(() => {
    if (animate) return
    const position = geometry.getAttribute('position')
    ;(position.array as Float32Array).set(rest)
    position.needsUpdate = true
    invalidate()
  }, [animate, geometry, rest, invalidate])

  const time = useRef(0)
  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta) * SEA_WAVE_SPEED
    const t = time.current
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3] ?? 0
      const z = rest[i * 3 + 2] ?? 0
      position.setY(
        i,
        SEA_LEVEL + SEA_WAVE_HEIGHT * Math.sin(x * 0.6 + t) * Math.cos(z * 0.6 + t * 0.8),
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
