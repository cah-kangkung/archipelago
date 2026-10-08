import type { DecorationType, Hex } from '@archipelago/shared'
import type { Focus } from '../world/selectors'
import { Island } from './island'
import { scenePalette } from './model/palette'
import type { SceneModel, SceneStructure } from './model/scene-model'
import { Sea } from './sea'
import { DIRECTIONAL_INTENSITY, HEMISPHERE_INTENSITY } from './tuning'

export type Placement = {
  /** The island being decorated; only it shows the glow and ghost. */
  projectId: string
  plots: readonly Hex[]
  ghost: { type: DecorationType; plot: Hex } | null
}

export type SceneHandlers = {
  onSelect: (taskId: string | null) => void
  onSelectBuilding: (buildingId: string) => void
  onPickPlot: (plot: Hex) => void
  onOpenIsland: (projectId: string) => void
  onOpenDistrict: (projectId: string, milestoneId: string) => void
}

export type WorldContentsProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  selectedBuildingId: string | null
  placement: Placement | null
  animate: boolean
}

const ignore = () => {}

/** Everything inside the Canvas except camera, labels and ticker, so it can be tested headless. */
export function WorldContents({
  model,
  focus,
  selectedTaskId,
  selectedBuildingId,
  placement,
  animate,
  ...handlers
}: WorldContentsProps) {
  // While placing, only a glowing plot answers a tap (spec 15.5).
  const live: SceneHandlers = placement
    ? {
        onSelect: ignore,
        onSelectBuilding: ignore,
        onOpenIsland: ignore,
        onOpenDistrict: ignore,
        onPickPlot: handlers.onPickPlot,
      }
    : handlers
  const focusedId = focus.kind === 'archipelago' ? null : focus.projectId
  // In a district only its own structures select; the rest of the island behaves like terrain.
  const pickable = (s: SceneStructure) =>
    focus.kind !== 'district' || s.milestoneId === focus.milestoneId
  return (
    <>
      <hemisphereLight args={[scenePalette.wall, scenePalette.sea, HEMISPHERE_INTENSITY]} />
      <directionalLight position={[12, 20, 6]} intensity={DIRECTIONAL_INTENSITY} />
      <Sea bounds={model.bounds} animate={animate} onTapSea={() => live.onSelect(null)} />
      {model.islands.map((island) => (
        <Island
          key={island.projectId}
          island={island}
          focused={island.projectId === focusedId}
          pickable={pickable}
          selectedTaskId={selectedTaskId}
          selectedBuildingId={selectedBuildingId}
          placement={placement?.projectId === island.projectId ? placement : null}
          animate={animate}
          {...live}
        />
      ))}
    </>
  )
}
