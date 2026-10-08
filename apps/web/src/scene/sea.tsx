import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seaMaterial } from './materials'
import { scenePalette } from './model/palette'
import type { Bounds } from './model/scene-model'
import { depthShade, type Shore, shoreDistance } from './model/sea-depth'
import { SEA_LEVEL } from './models/terrain-geometry'
import { onTap } from './tap'
import { clampDelta, SEA_SEGMENTS, SEA_WAVE_HEIGHT, SEA_WAVE_SPEED } from './tuning'
import { useStableShores } from './use-stable-shores'

/** Open water beyond the outermost island, in world units: enough to fill a desktop viewport at
 * archipelago zoom. */
const SEA_MARGIN = 250

const shallowColor = new THREE.Color(scenePalette.seaShallow)
const deepColor = new THREE.Color(scenePalette.seaDeep)
const shade = new THREE.Color()

export function Sea({
  bounds,
  islands,
  animate,
  onTapSea,
}: {
  bounds: Bounds
  islands: readonly Shore[]
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
  const shores = useStableShores(islands)

  // Depth gradient (spec 17.1): once per layout, never per frame.
  useLayoutEffect(() => {
    const data = new Float32Array(rest.length)
    for (let i = 0; i < rest.length / 3; i++) {
      const p = { x: rest[i * 3] ?? 0, z: rest[i * 3 + 2] ?? 0 }
      shade.lerpColors(shallowColor, deepColor, depthShade(shoreDistance(p, shores)))
      data.set([shade.r, shade.g, shade.b], i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
    invalidate()
  }, [geometry, rest, shores, invalidate])

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
