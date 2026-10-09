import {
  DECORATION_TYPES,
  type DecorationType,
  decorationRotation,
  type Hex,
  hexKey,
} from '@archipelago/shared'
import { useEffect, useMemo } from 'react'
import type { RewardEvent } from '../rewards/reward-store'
import { CraneJibs } from './crane-jibs'
import { Landmark } from './landmark'
import { placementGhostMaterial, plotMaterial, shadowMaterial, solidMaterial } from './materials'
import { hexToWorld, type Point, type Spot } from './model/hex-space'
import { resolvePop } from './model/reward-motion'
import type { SceneIsland, SceneStructure } from './model/scene-model'
import { STRUCTURE_KINDS, type StructureKind } from './model/state'
import { heightAt, tileHeights } from './model/terrain'
import { ModelInstances } from './model-instances'
import { modelGeometry } from './models/structures'
import { islandGeometry } from './models/terrain-geometry'
import { onTap } from './tap'
import type { Placement, SceneHandlers } from './world-contents'

/** Only a newly finished building pops; scaffolds and cranes never do. */
const BUILT: ReadonlySet<StructureKind> = new Set(['hut', 'house', 'workshop'])

/** One rotation step is 60°. */
const TURN = Math.PI / 3

export function Island({
  island,
  focused,
  pickable,
  opensIsland,
  opensDistricts,
  inLayer,
  selectedTaskId,
  selectedBuildingId,
  placement,
  animate,
  rewards,
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
  /** A tap on this (unfocused) island opens it; otherwise it only clears, like open sea. */
  opensIsland: boolean
  /** A landmark tap opens its district (the island layer only). */
  opensDistricts: boolean
  /** Whether a world-space point is inside the current layer (spec 20.4). */
  inLayer: (p: Point) => boolean
  selectedTaskId: string | null
  selectedBuildingId: string | null
  /** Already filtered to this island by WorldContents. */
  placement: Placement | null
  animate: boolean
  rewards: readonly RewardEvent[]
}) {
  const pathKey = island.paths.map(hexKey).join(';')
  // A refetch builds fresh tiles with the same content; seed, size, stage and paths decide them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these four determine the tiles
  const terrain = useMemo(
    () => islandGeometry(island.tiles, island.shallows),
    [island.seed, island.size, island.stage, pathKey],
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
  const heights = useMemo(() => tileHeights(island.tiles), [island.tiles])
  const world = (p: Point): Point => ({ x: island.origin.x + p.x, z: island.origin.z + p.z })
  // biome-ignore lint/correctness/useExhaustiveDependencies: `world` reads the origin listed here
  const livePlots = useMemo(
    () => placement?.plots.filter((h) => inLayer(world(hexToWorld(h)))) ?? [],
    [placement?.plots, inLayer, island.origin.x, island.origin.z],
  )
  const plotPoints = useMemo(
    (): Spot[] => livePlots.map((h) => ({ ...hexToWorld(h), y: heightAt(heights, h) })),
    [livePlots, heights],
  )

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
      onClick={
        focused
          ? undefined
          : onTap<MouseEvent>(() => (opensIsland ? onOpenIsland(island.projectId) : onSelect(null)))
      }
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
          pop={
            animate && BUILT.has(kind)
              ? resolvePop(
                  structures.map((s) => s.taskId),
                  'task',
                  rewards,
                )
              : undefined
          }
          onPick={picker(structures)}
        />
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
          pop={
            animate
              ? resolvePop(
                  decorations.map((d) => d.buildingId),
                  'building',
                  rewards,
                )
              : undefined
          }
          onPick={
            focused
              ? (i) => {
                  const d = decorations[i]
                  if (!d) return
                  if (inLayer(world(d.position))) onSelectBuilding(d.buildingId)
                  else onSelect(null)
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
            const plot = livePlots[i]
            if (plot) onPickPlot(plot)
          }}
        />
      )}
      {placement?.ghost && (
        <Ghost
          type={placement.ghost.type}
          plot={placement.ghost.plot}
          y={heightAt(heights, placement.ghost.plot)}
        />
      )}
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
          onOpen={
            focused && opensDistricts
              ? () => onOpenDistrict(island.projectId, d.milestoneId)
              : undefined
          }
        />
      ))}
      {selected && (
        <mesh
          name="selection"
          geometry={modelGeometry('selection')}
          material={solidMaterial}
          position={[selected.position.x, selected.position.y, selected.position.z]}
        />
      )}
    </group>
  )
}

/** The decoration about to be bought; no handlers, so taps fall through to the glow beneath. */
function Ghost({ type, plot, y }: { type: DecorationType; plot: Hex; y: number }) {
  const at = hexToWorld(plot)
  return (
    <mesh
      name="ghost"
      geometry={modelGeometry(type)}
      material={placementGhostMaterial}
      position={[at.x, y, at.z]}
      rotation={[0, decorationRotation(plot) * TURN, 0]}
    />
  )
}
