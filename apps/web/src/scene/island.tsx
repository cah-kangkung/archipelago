import { useEffect, useMemo } from 'react'
import { CraneJibs } from './crane-jibs'
import { Landmark } from './landmark'
import { shadowMaterial, solidMaterial } from './materials'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneIsland } from './model/scene-model'
import { STRUCTURE_KINDS } from './model/state'
import { ModelInstances } from './model-instances'
import { modelGeometry } from './models/structures'
import { islandGeometry } from './models/terrain-geometry'
import { onTap } from './tap'
import type { SceneHandlers } from './world-contents'

export function Island({
  island,
  focused,
  selectedTaskId,
  animate,
  onSelect,
  onOpenIsland,
  onOpenDistrict,
}: SceneHandlers & {
  island: SceneIsland
  focused: boolean
  selectedTaskId: string | null
  animate: boolean
}) {
  const terrain = useMemo(
    () => islandGeometry(island.tiles, island.radius),
    [island.tiles, island.radius],
  )
  useEffect(() => () => terrain.dispose(), [terrain])

  const layers = useMemo(() => {
    const byKind = STRUCTURE_KINDS.map((kind) => {
      const structures = island.structures.filter((s) => s.kind === kind)
      return { kind, structures, points: structures.map((s) => s.position) }
    })
    const at = (marker: 'storm' | 'lantern') =>
      island.structures.filter((s) => s.marker === marker).map((s) => s.position)
    return {
      byKind,
      storms: at('storm'),
      lanterns: at('lantern'),
      shadows: island.structures.map((s) => s.position),
      cranes: island.structures.filter((s) => s.kind === 'crane').map((s) => s.position),
    }
  }, [island.structures])

  const selected = island.structures.find((s) => s.taskId === selectedTaskId)

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
        <ModelInstances
          key={kind}
          kind={kind}
          points={points}
          onPick={focused ? (i) => onSelect(structures[i]?.taskId ?? null) : undefined}
        />
      ))}
      <ModelInstances kind="storm" points={layers.storms} />
      <ModelInstances kind="lantern" points={layers.lanterns} />
      <ModelInstances kind="shadow" points={layers.shadows} material={shadowMaterial} />
      <CraneJibs points={layers.cranes} animate={animate} />
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
