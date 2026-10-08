import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import type { Spot } from './model/hex-space'
import { hashString } from './model/random'
import type { SceneIsland } from './model/scene-model'
import { SCENERY_KINDS, type SceneryKind, sceneryGeometry } from './models/scenery'
import { useStableShores } from './use-stable-shores'

const matrix = new THREE.Matrix4()
const size = new THREE.Vector3()
const noRaycast = () => {}

type Item = { id: string; position: Spot; turn: number; scale: number }

/** What decides an island's pieces: a refetch with the same key must not rebuild them. */
const sceneryKey = (islands: readonly SceneIsland[]) =>
  islands
    .map((i) => {
      const ids = hashString(i.scenery.map((p) => p.id).join('|'))
      const dock = i.dock ? `${i.dock.position.x},${i.dock.position.z}` : '-'
      return `${i.projectId}@${i.origin.x},${i.origin.z}r${i.radius}#${i.stage}:${ids}:${dock}`
    })
    .join(';')

function itemsOf(islands: readonly SceneIsland[], kind: SceneryKind, lowTier: boolean): Item[] {
  return islands.flatMap((island): Item[] => {
    const at = (p: Spot): Spot => ({
      x: island.origin.x + p.x,
      y: p.y,
      z: island.origin.z + p.z,
    })
    if (kind === 'dock') {
      return island.dock
        ? [
            {
              id: `${island.projectId}:dock`,
              position: at(island.dock.position),
              turn: island.dock.turn,
              scale: 1,
            },
          ]
        : []
    }
    return island.scenery
      .filter((p) => p.type === kind && (!lowTier || p.low))
      .map((p) => ({
        id: `${island.projectId}:${p.id}`,
        position: at(p.position),
        turn: p.turn,
        scale: p.scale,
      }))
  })
}

/**
 * Trees, bushes, rocks, flowers, grass, reeds, driftwood and docks on every island (spec 18.5):
 * one instanced mesh per kind for the whole archipelago, placed once per layout and never
 * tappable, so a tap reaches the terrain beneath.
 */
export function SceneryLayer({
  islands,
  lowTier,
}: {
  islands: readonly SceneIsland[]
  lowTier: boolean
  /** The grow-in may run (`high` tier, motion allowed); used from Task 5. */
  animate: boolean
  /** Reports a grow-in starting and ending, for the ticker; used from Task 5. */
  onGrowth?: (running: boolean) => void
}) {
  const stable = useStableShores(islands, sceneryKey)
  const byKind = useMemo(
    () => SCENERY_KINDS.map((kind) => ({ kind, items: itemsOf(stable, kind, lowTier) })),
    [stable, lowTier],
  )
  const meshes = useRef(new Map<SceneryKind, THREE.InstancedMesh>())
  const invalidate = useThree((s) => s.invalidate)

  const write = useCallback(
    (factor: (id: string) => number) => {
      for (const { kind, items } of byKind) {
        const mesh = meshes.current.get(kind)
        if (!mesh) continue
        items.forEach((item, i) => {
          matrix
            .makeRotationY(item.turn)
            .scale(size.setScalar(item.scale * factor(item.id)))
            .setPosition(item.position.x, item.position.y, item.position.z)
          mesh.setMatrixAt(i, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }
      invalidate()
    },
    [byKind, invalidate],
  )

  useLayoutEffect(() => write(() => 1), [write])

  return byKind.map(({ kind, items }) =>
    items.length === 0 ? null : (
      <instancedMesh
        // The instance count is fixed at construction; a new count needs a new mesh.
        key={`${kind}:${items.length}`}
        ref={(mesh) => {
          if (mesh) meshes.current.set(kind, mesh)
          else meshes.current.delete(kind)
        }}
        name={`scenery:${kind}`}
        args={[sceneryGeometry(kind), solidMaterial, items.length]}
        raycast={noRaycast}
      />
    ),
  )
}
