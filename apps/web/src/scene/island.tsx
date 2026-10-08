import {
  DECORATION_TYPES,
  type DecorationType,
  decorationRotation,
  type Hex,
} from '@archipelago/shared'
import { useEffect, useMemo } from 'react'
import { CraneJibs } from './crane-jibs'
import { Landmark } from './landmark'
import { placementGhostMaterial, plotMaterial, shadowMaterial, solidMaterial } from './materials'
import { hexToWorld, LAND_HEIGHT } from './model/hex-space'
import type { SceneIsland, SceneStructure } from './model/scene-model'
import { STRUCTURE_KINDS } from './model/state'
import { ModelInstances } from './model-instances'
import { modelGeometry } from './models/structures'
import { islandGeometry } from './models/terrain-geometry'
import { onTap } from './tap'
import type { Placement, SceneHandlers } from './world-contents'

/** One rotation step is 60°. */
const TURN = Math.PI / 3

export function Island({
  island,
  focused,
  pickable,
  selectedTaskId,
  selectedBuildingId,
  placement,
  animate,
  onSelect,
  onSelectBuilding,
  onPickPlot,
  onOpenIsland,
  onOpenDistrict,
}: SceneHandlers & {
  island: SceneIsland
  focused: boolean
  /** Which structures a tap may select; the rest clear the selection, like terrain. */
  pickable: (s: SceneStructure) => boolean
  selectedTaskId: string | null
  selectedBuildingId: string | null
  /** Already filtered to this island by WorldContents. */
  placement: Placement | null
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
      shadows: [...island.structures, ...island.decorations].map((s) => s.position),
      cranes: carrying(island.structures.filter((s) => s.kind === 'crane')),
    }
  }, [island.structures, island.decorations])

  const decorationLayers = useMemo(
    () =>
      DECORATION_TYPES.map((type) => {
        const decorations = island.decorations.filter((d) => d.type === type)
        return {
          type,
          decorations,
          points: decorations.map((d) => d.position),
          turns: decorations.map((d) => d.rotation * TURN),
        }
      }),
    [island.decorations],
  )
  const plotPoints = useMemo(() => placement?.plots.map(hexToWorld) ?? [], [placement?.plots])

  const selected =
    island.structures.find((s) => s.taskId === selectedTaskId) ??
    island.decorations.find((d) => d.buildingId === selectedBuildingId)
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
      {decorationLayers.map(({ type, decorations, points, turns }) => (
        <ModelInstances
          key={type}
          kind={type}
          points={points}
          turns={turns}
          onPick={
            focused
              ? (i) => {
                  const d = decorations[i]
                  if (d) onSelectBuilding(d.buildingId)
                }
              : undefined
          }
        />
      ))}
      {placement && (
        <ModelInstances
          kind="plot"
          points={plotPoints}
          material={plotMaterial}
          onPick={(i) => {
            const plot = placement.plots[i]
            if (plot) onPickPlot(plot)
          }}
        />
      )}
      {placement?.ghost && <Ghost type={placement.ghost.type} plot={placement.ghost.plot} />}
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

/** The decoration about to be bought; no handlers, so taps fall through to the glow beneath. */
function Ghost({ type, plot }: { type: DecorationType; plot: Hex }) {
  const at = hexToWorld(plot)
  return (
    <mesh
      name="ghost"
      geometry={modelGeometry(type)}
      material={placementGhostMaterial}
      position={[at.x, LAND_HEIGHT, at.z]}
      rotation={[0, decorationRotation(plot) * TURN, 0]}
    />
  )
}
