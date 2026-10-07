import type { Focus } from '../world/selectors'
import { Island } from './island'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import { Sea } from './sea'

// Lambert divides by π; ×π lets a top face lit by both lights read near its token (§13.3).
const HEMISPHERE_INTENSITY = Math.PI * 0.55
const DIRECTIONAL_INTENSITY = Math.PI * 0.6

export type SceneHandlers = {
  onSelect: (taskId: string | null) => void
  onOpenIsland: (projectId: string) => void
  onOpenDistrict: (projectId: string, milestoneId: string) => void
}

export type WorldContentsProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  animate: boolean
}

/** Everything inside the Canvas except camera, labels and ticker, so it can be tested headless. */
export function WorldContents({
  model,
  focus,
  selectedTaskId,
  animate,
  ...handlers
}: WorldContentsProps) {
  const focusedId = focus.kind === 'archipelago' ? null : focus.projectId
  return (
    <>
      <hemisphereLight args={[scenePalette.wall, scenePalette.sea, HEMISPHERE_INTENSITY]} />
      <directionalLight position={[12, 20, 6]} intensity={DIRECTIONAL_INTENSITY} />
      <Sea bounds={model.bounds} animate={animate} onTapSea={() => handlers.onSelect(null)} />
      {model.islands.map((island) => (
        <Island
          key={island.projectId}
          island={island}
          focused={island.projectId === focusedId}
          selectedTaskId={selectedTaskId}
          animate={animate}
          {...handlers}
        />
      ))}
    </>
  )
}
