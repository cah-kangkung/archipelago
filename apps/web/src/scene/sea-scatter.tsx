import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import type { Point } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import { SCATTER_TYPES, seaScatter } from './model/sea-scatter'
import { seaGeometry } from './models/sea-props'
import { SEA_LEVEL } from './models/terrain-geometry'

const matrix = new THREE.Matrix4()

/** A static InstancedMesh at sea level: no taps, no frames after it is placed. */
export function StaticInstances({
  name,
  geometry,
  items,
}: {
  name: string
  geometry: THREE.BufferGeometry
  items: readonly { position: Point; turn: number }[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((item, i) => {
      matrix.makeRotationY(item.turn).setPosition(item.position.x, SEA_LEVEL, item.position.z)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [items, invalidate])
  if (items.length === 0) return null
  return (
    <instancedMesh
      // The instance count is fixed at construction; a new count needs a new mesh.
      key={items.length}
      ref={ref}
      name={name}
      args={[geometry, solidMaterial, items.length]}
    />
  )
}

/** Rocks, islets, sandbars and buoys in the open water (spec 17.2). */
export function SeaScatter({ model }: { model: Pick<SceneModel, 'islands' | 'bounds'> }) {
  const props = useMemo(() => seaScatter(model), [model])
  return SCATTER_TYPES.map((type) => (
    <StaticInstances
      key={type}
      name={`scatter:${type}`}
      geometry={seaGeometry(type)}
      items={props.filter((p) => p.type === type)}
    />
  ))
}
