import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { type Pop, popScale } from './model/reward-motion'
import { type ModelKind, modelGeometry } from './models/structures'
import { onTap } from './tap'
import { clampDelta, POP_MS } from './tuning'

const matrix = new THREE.Matrix4()
const scale = new THREE.Vector3()

function compose(p: Point, turn: number, size: number) {
  matrix.makeRotationY(turn)
  if (size !== 1) matrix.scale(scale.setScalar(size))
  return matrix.setPosition(p.x, LAND_HEIGHT, p.z)
}

/**
 * One InstancedMesh drawing `kind` at every point; `onPick` receives the tapped point's index.
 * `pop` scales one instance 0 → 1.15 → 1; a new `startedAt` restarts it.
 */
export function ModelInstances({
  kind,
  points,
  turns,
  material = solidMaterial,
  pop,
  onPick,
}: {
  kind: ModelKind
  points: readonly Point[]
  /** Radians about y, one per point. */
  turns?: readonly number[]
  material?: THREE.Material
  pop?: Pop
  onPick?: (index: number) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  // The pop's own clock: it starts when the instance first renders with this pop.
  const popClock = useRef<{ startedAt: number; elapsed: number } | null>(null)
  const popIndex = pop?.index
  const popStartedAt = pop?.startedAt

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    if (popStartedAt === undefined) popClock.current = null
    else if (popClock.current?.startedAt !== popStartedAt) {
      popClock.current = { startedAt: popStartedAt, elapsed: 0 }
    }
    const clock = popClock.current
    points.forEach((p, i) => {
      const size = clock && i === popIndex ? popScale(clock.elapsed / POP_MS) : 1
      mesh.setMatrixAt(i, compose(p, turns?.[i] ?? 0, size))
    })
    mesh.instanceMatrix.needsUpdate = true
    // Raycasting tests against the instances' bounds, so they must follow the matrices.
    mesh.computeBoundingSphere()
    invalidate()
  }, [points, turns, popIndex, popStartedAt, invalidate])

  useFrame((_, delta) => {
    const mesh = ref.current
    const clock = popClock.current
    if (!mesh || !clock || popIndex === undefined || clock.elapsed >= POP_MS) return
    clock.elapsed = Math.min(POP_MS, clock.elapsed + clampDelta(delta) * 1000)
    // A refetch can shrink the layer under a running pop; a stale index is skipped.
    const p = points[popIndex]
    if (!p) return
    mesh.setMatrixAt(popIndex, compose(p, turns?.[popIndex] ?? 0, popScale(clock.elapsed / POP_MS)))
    mesh.instanceMatrix.needsUpdate = true
    if (clock.elapsed < POP_MS) invalidate()
    // The bounds were taken while the popped instance was still at scale 0.
    else mesh.computeBoundingSphere()
  })

  if (points.length === 0) return null
  return (
    <instancedMesh
      // The instance count is fixed at construction; a new count needs a new mesh.
      key={points.length}
      ref={ref}
      name={kind}
      args={[modelGeometry(kind), material, points.length]}
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
