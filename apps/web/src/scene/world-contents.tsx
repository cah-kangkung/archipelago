import type { DecorationType, Hex } from '@archipelago/shared'
import type { RewardEvent } from '../rewards/reward-store'
import type { Focus } from '../world/selectors'
import { AmbientLifeLayer } from './ambient-life'
import { EmptySea } from './empty-sea'
import { Island } from './island'
import { type AmbientLife, NO_LIFE } from './model/ambient-life'
import { scenePalette } from './model/palette'
import type { SceneModel, SceneStructure } from './model/scene-model'
import { RewardFloats } from './reward-floats'
import { SceneryLayer } from './scenery'
import { Sea } from './sea'
import { SeaScatter } from './sea-scatter'
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
  /** The sea wave runs; false on the low tier. Defaults to `animate`. */
  seaWave?: boolean
  rewards: readonly RewardEvent[]
  /** Opens the new-island editor; offered over the empty sea. */
  onNewProject?: () => void
  /** Boats, gulls and the whale (spec 17.5); none by default. */
  life?: AmbientLife
  /** The `low` quality tier: scenery draws its thinner half (spec 18.2). */
  lowTier?: boolean
  /** A scenery grow-in started (true) or ended (false); keeps the ticker running for it. */
  onGrowth?: (running: boolean) => void
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
  seaWave = animate,
  rewards,
  onNewProject,
  life = NO_LIFE,
  lowTier = false,
  onGrowth,
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
      <Sea
        bounds={model.bounds}
        islands={model.islands}
        animate={seaWave}
        onTapSea={() => live.onSelect(null)}
      />
      <SeaScatter model={model} />
      <AmbientLifeLayer life={life} islands={model.islands} animate={seaWave} />
      <SceneryLayer
        islands={model.islands}
        lowTier={lowTier}
        animate={seaWave}
        onGrowth={onGrowth}
      />
      {model.islands.length === 0 && <EmptySea onCreate={onNewProject} />}
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
          rewards={rewards}
          {...live}
        />
      ))}
      {animate && <RewardFloats model={model} focus={focus} events={rewards} />}
    </>
  )
}
