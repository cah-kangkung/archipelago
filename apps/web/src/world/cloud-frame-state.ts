import { CLOUD_FRAME_ISLAND_SCALE } from '../scene/tuning'
import type { Focus } from './selectors'

/** Whether the cloud frame shows, and how far out its wisps sit (spec 22.2). */
export function cloudFrameState(focus: Focus): { shown: boolean; scale: number } {
  switch (focus.kind) {
    case 'archipelago':
      return { shown: false, scale: CLOUD_FRAME_ISLAND_SCALE }
    case 'island':
      return { shown: true, scale: CLOUD_FRAME_ISLAND_SCALE }
    case 'district':
      return { shown: true, scale: 1 }
  }
}
