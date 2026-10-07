import type { Focus } from '../world/selectors'
import { Island } from './island'
import { scenePalette } from './model/palette'
import type { SceneModel } from './model/scene-model'
import { Sea } from './sea'

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
      <hemisphereLight args={[scenePalette.wall, scenePalette.sea, 0.9]} />
      <directionalLight position={[12, 20, 6]} intensity={1.6} />
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
