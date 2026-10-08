import type { RewardEvent } from '../../rewards/reward-store'
import type { Focus } from '../../world/selectors'
import {
  FLOAT_ABOVE_ISLAND,
  FLOAT_ABOVE_STRUCTURE,
  FLOAT_MS,
  FLOAT_RISE,
  FLOAT_STAGGER_MS,
  POP_BACK,
} from '../tuning'
import { LAND_HEIGHT } from './hex-space'
import type { SceneModel } from './scene-model'

export type Pop = { index: number; startedAt: number }

/** Ease-out back, 0 → 1.15 → 1 (spec 16.2). */
export function popScale(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const u = t - 1
  return 1 + (POP_BACK + 1) * u ** 3 + POP_BACK * u ** 2
}

/** The newest live event aimed at one of `ids` (instance order), as a pop of that instance. */
export function resolvePop(
  ids: readonly string[],
  kind: 'task' | 'building',
  events: readonly RewardEvent[],
): Pop | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (!e || e.target?.kind !== kind) continue
    const index = ids.indexOf(e.target.id)
    if (index >= 0) return { index, startedAt: e.at }
  }
  return undefined
}

export type FloatFrame = { rise: number; opacity: number; visible: boolean }

/** Line `line` of a float, `elapsedMs` after the float appeared: rising, fading, staggered. */
export function floatFrame(elapsedMs: number, line: number): FloatFrame {
  const t = (elapsedMs - line * FLOAT_STAGGER_MS) / FLOAT_MS
  if (t < 0) return { rise: 0, opacity: 0, visible: false }
  if (t >= 1) return { rise: FLOAT_RISE, opacity: 0, visible: false }
  return { rise: FLOAT_RISE * (1 - (1 - t) ** 2), opacity: 1 - t, visible: true }
}

export type FloatAnchor = { x: number; y: number; z: number }

/**
 * Where an event's floats start: above the target on its focused island, otherwise above that
 * island's centre; null when the target is not in the scene model.
 */
export function floatAnchor(
  model: SceneModel,
  focus: Focus,
  target: RewardEvent['target'],
): FloatAnchor | null {
  if (!target) return null
  for (const island of model.islands) {
    const spot =
      target.kind === 'task'
        ? island.structures.find((s) => s.taskId === target.id)?.position
        : island.decorations.find((d) => d.buildingId === target.id)?.position
    if (!spot) continue
    const focused = focus.kind !== 'archipelago' && focus.projectId === island.projectId
    return focused
      ? {
          x: island.origin.x + spot.x,
          y: spot.y + FLOAT_ABOVE_STRUCTURE,
          z: island.origin.z + spot.z,
        }
      : { x: island.origin.x, y: LAND_HEIGHT + FLOAT_ABOVE_ISLAND, z: island.origin.z }
  }
  return null
}
