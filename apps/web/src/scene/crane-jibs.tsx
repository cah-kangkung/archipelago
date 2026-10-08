import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { JIB_PIVOT, modelGeometry } from './models/structures'
import { onTap } from './tap'
import { clampDelta, JIB_TURN_SPEED } from './tuning'

const matrix = new THREE.Matrix4()

/**
 * The turning arm on every crane; it swings only while animation is allowed. `onPick` receives
 * the tapped crane's index.
 */
export function CraneJibs({
  points,
  animate,
  onPick,
}: {
  points: readonly Point[]
  animate: boolean
  onPick?: (index: number) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const place = (time: number) => {
    const mesh = ref.current
    if (!mesh) return
    points.forEach((p, i) => {
      matrix.makeRotationY(time * JIB_TURN_SPEED + i * 1.7)
      matrix.setPosition(p.x + JIB_PIVOT[0], LAND_HEIGHT + JIB_PIVOT[1], p.z + JIB_PIVOT[2])
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: place reads the latest points
  useLayoutEffect(() => place(0), [points])
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta)
    place(time.current)
  })

  if (points.length === 0) return null
  return (
    <instancedMesh
      key={points.length}
      ref={ref}
      name="jib"
      args={[modelGeometry('jib'), solidMaterial, points.length]}
      onClick={
        onPick
          ? onTap<MouseEvent>((event) => {
              if (event.instanceId !== undefined) onPick(event.instanceId)
            })
          : undefined
      }
    />
  )
}
