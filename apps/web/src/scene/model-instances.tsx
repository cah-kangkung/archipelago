import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { type ModelKind, modelGeometry } from './models/structures'
import { onTap } from './tap'

/** One InstancedMesh drawing `kind` at every point; `onPick` receives the tapped point's index. */
export function ModelInstances({
  kind,
  points,
  material = solidMaterial,
  onPick,
}: {
  kind: ModelKind
  points: readonly Point[]
  material?: THREE.Material
  onPick?: (index: number) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    points.forEach((p, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(p.x, LAND_HEIGHT, p.z))
    })
    mesh.instanceMatrix.needsUpdate = true
    // Raycasting tests against the instances' bounds, so they must follow the matrices.
    mesh.computeBoundingSphere()
    invalidate()
  }, [points, invalidate])

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
