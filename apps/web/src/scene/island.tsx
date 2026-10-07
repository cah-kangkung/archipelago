import { useEffect, useMemo } from 'react'
import { CraneJibs } from './crane-jibs'
import { Landmark } from './landmark'
import { shadowMaterial, solidMaterial } from './materials'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneIsland, SceneStructure } from './model/scene-model'
import { STRUCTURE_KINDS } from './model/state'
import { ModelInstances } from './model-instances'
import { modelGeometry } from './models/structures'
import { islandGeometry } from './models/terrain-geometry'
import { onTap } from './tap'
import type { SceneHandlers } from './world-contents'

export function Island({
  island,
  focused,
  pickable,
  selectedTaskId,
  animate,
  onSelect,
  onOpenIsland,
  onOpenDistrict,
}: SceneHandlers & {
  island: SceneIsland
  focused: boolean
  /** Which structures a tap may select; the rest clear the selection, like terrain. */
  pickable: (s: SceneStructure) => boolean
  selectedTaskId: string | null
  animate: boolean
}) {
  // A refetch builds fresh tiles with the same content; only the seed and radius change them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed and radius determine the tiles
  const terrain = useMemo(
    () => islandGeometry(island.tiles, island.radius),
    [island.seed, island.radius],
  )
  useEffect(() => () => terrain.dispose(), [terrain])

  const layers = useMemo(() => {
    const byKind = STRUCTURE_KINDS.map((kind) => {
      const structures = island.structures.filter((s) => s.kind === kind)
      return { kind, structures, points: structures.map((s) => s.position) }
    })
    const carrying = (structures: SceneStructure[]) => ({
      structures,
      points: structures.map((s) => s.position),
    })
    return {
      byKind,
      storms: carrying(island.structures.filter((s) => s.marker === 'storm')),
      lanterns: carrying(island.structures.filter((s) => s.marker === 'lantern')),
      shadows: island.structures.map((s) => s.position),
      cranes: carrying(island.structures.filter((s) => s.kind === 'crane')),
    }
  }, [island.structures])

  const selected = island.structures.find((s) => s.taskId === selectedTaskId)
  // Structures, their markers and crane jibs select only on the focused island.
  const picker = (structures: readonly SceneStructure[]) =>
    focused
      ? (i: number) => {
          const s = structures[i]
          onSelect(s && pickable(s) ? s.taskId : null)
        }
      : undefined

  return (
    <group
      name={`island:${island.projectId}`}
      position={[island.origin.x, 0, island.origin.z]}
      onClick={focused ? undefined : onTap<MouseEvent>(() => onOpenIsland(island.projectId))}
    >
      <mesh
        name="terrain"
        geometry={terrain}
        material={solidMaterial}
        onClick={focused ? onTap<MouseEvent>(() => onSelect(null)) : undefined}
      />
      {layers.byKind.map(({ kind, structures, points }) => (
        <ModelInstances key={kind} kind={kind} points={points} onPick={picker(structures)} />
      ))}
      <ModelInstances
        kind="storm"
        points={layers.storms.points}
        onPick={picker(layers.storms.structures)}
      />
      <ModelInstances
        kind="lantern"
        points={layers.lanterns.points}
        onPick={picker(layers.lanterns.structures)}
      />
      <ModelInstances kind="shadow" points={layers.shadows} material={shadowMaterial} />
      <CraneJibs
        points={layers.cranes.points}
        animate={animate}
        onPick={picker(layers.cranes.structures)}
      />
      {island.districts.map((d) => (
        <Landmark
          key={d.milestoneId}
          district={d}
          onOpen={focused ? () => onOpenDistrict(island.projectId, d.milestoneId) : undefined}
        />
      ))}
      {selected && (
        <mesh
          name="selection"
          geometry={modelGeometry('selection')}
          material={solidMaterial}
          position={[selected.position.x, LAND_HEIGHT, selected.position.z]}
        />
      )}
    </group>
  )
}
