import { type Hex, hexKey } from '@archipelago/shared'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import type { Spot } from './model/hex-space'
import { growEase } from './model/island-growth'
import { hashString } from './model/random'
import type { SceneIsland } from './model/scene-model'
import { SCENERY_KINDS, type SceneryKind, sceneryGeometry } from './models/scenery'
import { clampDelta, GROW_IN_MS } from './tuning'
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

function itemsOf(
  islands: readonly SceneIsland[],
  kind: SceneryKind,
  lowTier: boolean,
  hidden: { projectId: string; hex: string } | null,
): Item[] {
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
      .filter((p) => !(hidden?.projectId === island.projectId && p.id.split(':')[0] === hidden.hex))
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
  animate,
  onGrowth,
  hidden = null,
}: {
  islands: readonly SceneIsland[]
  lowTier: boolean
  /** The grow-in may run (`high` tier, motion allowed). */
  animate: boolean
  /** Reports a grow-in starting and ending, for the ticker. */
  onGrowth?: (running: boolean) => void
  /** A plot whose pieces are left out (under the placement ghost); not a stage change. */
  hidden?: { projectId: string; hex: Hex } | null
}) {
  const stable = useStableShores(islands, sceneryKey)
  const hiddenProject = hidden?.projectId
  const hiddenHex = hidden ? hexKey(hidden.hex) : null
  const byKind = useMemo(() => {
    const skip = hiddenProject && hiddenHex ? { projectId: hiddenProject, hex: hiddenHex } : null
    return SCENERY_KINDS.map((kind) => ({ kind, items: itemsOf(stable, kind, lowTier, skip) }))
  }, [stable, lowTier, hiddenProject, hiddenHex])
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

  // Ids present at the last layout, per island stage: a stage rise grows in what is new.
  const seen = useRef<{ stages: Map<string, number>; ids: Set<string> } | null>(null)
  const growing = useRef<{ ids: Set<string>; elapsed: number; fresh: boolean } | null>(null)
  const report = useRef(onGrowth)
  report.current = onGrowth
  const factorOf = useCallback((id: string) => {
    const g = growing.current
    return g?.ids.has(id) ? growEase(g.elapsed / GROW_IN_MS) : 1
  }, [])

  // Runs before the write below in the same commit, so new pieces are first drawn at scale 0.
  useLayoutEffect(() => {
    const ids = new Set(stable.flatMap((i) => i.scenery.map((p) => `${i.projectId}:${p.id}`)))
    const stages = new Map(stable.map((i) => [i.projectId, i.stage]))
    const before = seen.current
    seen.current = { stages, ids }
    if (!before || !animate) return
    const fresh = stable
      .filter((i) => i.stage > (before.stages.get(i.projectId) ?? i.stage))
      .flatMap((i) => i.scenery.map((p) => `${i.projectId}:${p.id}`))
      .filter((id) => !before.ids.has(id))
    if (fresh.length === 0) return
    growing.current = { ids: new Set(fresh), elapsed: 0, fresh: true }
    report.current?.(true)
  }, [stable, animate])

  useLayoutEffect(() => write(factorOf), [write, factorOf])

  // Losing animation mid grow-in (tier drop, reduced motion) snaps everything to full size.
  useLayoutEffect(() => {
    if (animate || !growing.current) return
    growing.current = null
    report.current?.(false)
    write(factorOf)
  }, [animate, write, factorOf])

  useEffect(
    () => () => {
      if (growing.current) report.current?.(false)
    },
    [],
  )

  useFrame((_, delta) => {
    const g = growing.current
    if (!g || !animate) return
    g.elapsed = Math.min(GROW_IN_MS, g.elapsed + (g.fresh ? 0 : clampDelta(delta) * 1000))
    g.fresh = false
    write(factorOf)
    if (g.elapsed < GROW_IN_MS) return
    growing.current = null
    report.current?.(false)
  })

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
