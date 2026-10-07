import { Html } from '@react-three/drei'
import type { Focus } from '../world/selectors'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneModel } from './model/scene-model'

const tag =
  'pointer-events-none select-none whitespace-nowrap rounded-md bg-surface-primary/90 px-2 py-1 text-sm font-semibold text-text-primary shadow'

/** Island names in the archipelago; milestone names on the focused island. */
export function Labels({ model, focus }: { model: SceneModel; focus: Focus }) {
  if (focus.kind === 'archipelago') {
    return model.islands.map((island) => (
      <Html
        key={island.projectId}
        center
        position={[island.origin.x, LAND_HEIGHT + 1.6, island.origin.z]}
        className={tag}
      >
        {island.name}
      </Html>
    ))
  }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return null
  return island.districts.map((d) => (
    <Html
      key={d.milestoneId}
      center
      position={[island.origin.x + d.position.x, LAND_HEIGHT + 2.2, island.origin.z + d.position.z]}
      className={tag}
    >
      {d.name}
    </Html>
  ))
}
