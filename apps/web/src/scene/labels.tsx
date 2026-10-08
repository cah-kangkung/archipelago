import { Html } from '@react-three/drei'
import type { Focus } from '../world/selectors'
import { layerArea } from './model/camera'
import { LAND_HEIGHT } from './model/hex-space'
import type { SceneModel } from './model/scene-model'
import { labelOpacity } from './model/spotlight'

/** drei's default range reaches millions; keep labels low so the HUD (z-20) sits above them. */
const LABEL_Z: [number, number] = [10, 0]

const tag =
  'pointer-events-none select-none whitespace-nowrap rounded-md bg-surface-primary/90 px-2 py-1 text-sm font-semibold text-text-primary shadow'

/** Island names in the archipelago; milestone names on the focused island. */
export function Labels({ model, focus }: { model: SceneModel; focus: Focus }) {
  if (focus.kind === 'archipelago') {
    return model.islands.map((island) => (
      <Html
        key={island.projectId}
        center
        zIndexRange={LABEL_Z}
        position={[island.origin.x, LAND_HEIGHT + 1.6, island.origin.z]}
        className={tag}
      >
        {island.name}
      </Html>
    ))
  }
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return null
  const area = layerArea(model, focus)
  return island.districts.map((d) => (
    <Html
      key={d.milestoneId}
      center
      zIndexRange={LABEL_Z}
      position={[
        island.origin.x + d.position.x,
        d.position.y + 2.2,
        island.origin.z + d.position.z,
      ]}
      className={tag}
      style={{
        opacity: labelOpacity(area, {
          x: island.origin.x + d.position.x,
          z: island.origin.z + d.position.z,
        }),
      }}
    >
      {d.name}
    </Html>
  ))
}
