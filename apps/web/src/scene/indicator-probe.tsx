import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { ISO_DISTANCE } from './camera-rig'
import type { IndicatorStore } from './indicator-store'
import { islandExtent } from './model/hex-space'
import { edgeIndicators, type IslandUrgency, type UrgentIsland } from './model/indicators'
import type { SceneModel } from './model/scene-model'
import { useFrameSize } from './use-frame-size'

/** After each rendered frame, works out which urgent islands need an edge marker. */
export function IndicatorProbe({
  model,
  urgent,
  currentProjectId,
  covered,
  store,
}: {
  model: SceneModel
  urgent: readonly IslandUrgency[]
  currentProjectId: string | null
  covered: number
  store: IndicatorStore
}) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const frame = useFrameSize(covered)

  // Urgency or the sheet cover can change without the camera moving (a task completed, the sheet
  // resized): draw a frame to re-check.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the inputs are deliberate triggers
  useEffect(() => {
    invalidate()
  }, [urgent, currentProjectId, covered, invalidate])

  useFrame(() => {
    const islands: UrgentIsland[] = []
    for (const u of urgent) {
      if (u.projectId === currentProjectId) continue
      const island = model.islands.find((i) => i.projectId === u.projectId)
      if (!island) continue
      islands.push({
        ...u,
        x: island.origin.x,
        z: island.origin.z,
        extent: islandExtent(island.radius),
      })
    }
    const view = {
      x: camera.position.x - ISO_DISTANCE,
      z: camera.position.z - ISO_DISTANCE,
      zoom: camera.zoom,
    }
    store.set(edgeIndicators(islands, view, frame))
  })

  return null
}
