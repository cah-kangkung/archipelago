import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT } from '../tuning'
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

/** A 2×2 rotation, row-major: `[[a, b], [c, d]]` as `[a, b, c, d]`. */
export type Turn = readonly [number, number, number, number]

const STRAIGHT: Turn = [1, 0, 0, 1]
/** The second wisp layer's rotation, so the two layers never line up. */
export const LAYER_B_TURN: Turn = [0.8, -0.6, 0.6, 0.8]
/** The coverage map's rotation. */
export const COVER_TURN: Turn = [0.28, 0.96, -0.96, 0.28]

/** The drift distance after `seconds` more; unbounded (the layers share no common period). */
export function driftStep(along: number, seconds: number): number {
  return along + seconds * CLOUD_DECK_DRIFT
}

const fract = (v: number) => v - Math.floor(v)

/**
 * One layer's texture offset for a drift of `along` along (1, 1): `fract(turn · (along, along) /
 * scale)`, so the uniform stays in [0, 1) however long the session runs (spec 23.7).
 */
export function layerOffset(along: number, scale: number, turn: Turn = STRAIGHT): [number, number] {
  const [a, b, c, d] = turn
  return [fract(((a + b) * along) / scale), fract(((c + d) * along) / scale)]
}
