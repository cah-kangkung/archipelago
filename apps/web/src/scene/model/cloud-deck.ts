import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_TILE } from '../tuning'
import type { Area } from './area'
import { layerArea } from './camera'
import { easeInOutCubic } from './camera-motion'
import { SHALLOWS_MARGIN } from './hex-space'
import type { SceneModel } from './scene-model'
import { areaKey } from './spotlight'

/** The rounded rectangle offset outward by `by`: the same box with a larger rounding. */
export function growArea(area: Area, by: number): Area {
  return { ...area, round: (area.round ?? 0) + by }
}

/**
 * The deck's hole (spec 23.1): none on the archipelago; an island's land plus its shallows; a
 * district's rounded box. A district that falls back to its island takes the island's hole.
 */
export function deckHole(model: SceneModel, focus: Focus): Area | null {
  const area = layerArea(model, focus)
  if (!area || focus.kind === 'archipelago') return area
  const island = layerArea(model, { kind: 'island', projectId: focus.projectId })
  return island && areaKey(island) === areaKey(area) ? growArea(area, SHALLOWS_MARGIN) : area
}

/** What the deck shows: its hole and how strongly it covers the rest (0–1). */
export type Deck = { hole: Area | null; strength: number }

export const DECK_OFF: Deck = { hole: null, strength: 0 }

export function deckFor(hole: Area | null): Deck {
  return hole ? { hole, strength: 1 } : DECK_OFF
}

/**
 * The tween between what is shown and the new layer's deck: from off it fades in on the new hole,
 * hole to hole it slides at full strength, and to the archipelago it fades out in place.
 */
export function deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck } {
  if (!target.hole) return { from: current, to: { hole: current.hole, strength: 0 } }
  if (!current.hole || current.strength === 0) {
    return { from: { hole: target.hole, strength: current.strength }, to: target }
  }
  return { from: current, to: target }
}

const lerp = (a: number, b: number, e: number) => a + (b - a) * e

/** The deck `t` (0–1) of the way through a leg, eased. */
export function deckAt(from: Deck, to: Deck, t: number): Deck {
  if (t <= 0) return from
  if (t >= 1) return to
  const e = easeInOutCubic(t)
  const a = from.hole
  const b = to.hole
  const hole =
    a && b
      ? {
          minX: lerp(a.minX, b.minX, e),
          maxX: lerp(a.maxX, b.maxX, e),
          minZ: lerp(a.minZ, b.minZ, e),
          maxZ: lerp(a.maxZ, b.maxZ, e),
          round: lerp(a.round ?? 0, b.round ?? 0, e),
        }
      : (b ?? a)
  return { hole, strength: lerp(from.strength, to.strength, e) }
}

/** Two decks that look the same: both off, or the same hole at the same strength. */
export function sameDeck(a: Deck, b: Deck): boolean {
  const shown = (d: Deck) => (d.hole ? d.strength : 0)
  if (shown(a) === 0 && shown(b) === 0) return true
  return shown(a) === shown(b) && areaKey(a.hole) === areaKey(b.hole)
}

/** The drift offset after `seconds`, wrapped at one texture tile. */
export function driftStep(along: number, seconds: number): number {
  return (along + seconds * CLOUD_DECK_DRIFT) % CLOUD_DECK_TILE
}
