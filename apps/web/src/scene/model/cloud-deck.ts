import type { Focus } from '../../world/selectors'
import { CLOUD_DECK_DRIFT, CLOUD_DECK_DRIFT_WRAP, CLOUD_DECK_FEATHER, CLOUD_VEIL } from '../tuning'
import type { Area } from './area'
import { layerArea } from './camera'
import { easeInOutCubic } from './camera-motion'
import type { SceneModel } from './scene-model'
import { areaKey } from './spotlight'

/**
 * The deck's hole (spec 23.7): a district's rounded box, and nothing elsewhere. A district that
 * falls back to its island (an unknown milestone) shows the veil.
 */
export function deckHole(model: SceneModel, focus: Focus): Area | null {
  if (focus.kind !== 'district') return null
  const area = layerArea(model, focus)
  const island = layerArea(model, { kind: 'island', projectId: focus.projectId })
  if (!area || !island || areaKey(area) === areaKey(island)) return null
  return area
}

/** What the deck shows: its hole and how strongly it covers the rest (0–1). */
export type Deck = { hole: Area | null; strength: number }

/** Before the first mount writes anything. */
export const DECK_OFF: Deck = { hole: null, strength: 0 }

/** The archipelago and island layers: a light veil with no hole. */
export const VEIL: Deck = { hole: null, strength: CLOUD_VEIL }

export function deckFor(hole: Area | null): Deck {
  return hole ? { hole, strength: 1 } : VEIL
}

/** The hole shrunk to its centre and rounded inward by the feather: it shows nothing. */
export function closeHole(area: Area): Area {
  const x = (area.minX + area.maxX) / 2
  const z = (area.minZ + area.maxZ) / 2
  return { minX: x, maxX: x, minZ: z, maxZ: z, round: -CLOUD_DECK_FEATHER }
}

/** The deck cuts a visible hole: one is set and not closed. */
export function isOpen(d: Deck): boolean {
  return d.hole !== null && (d.hole.round ?? 0) > -CLOUD_DECK_FEATHER
}

/**
 * The tween between what is shown and the new layer's deck (spec 23.7): into a district the hole
 * opens from its centre as the cloud thickens; out of one it closes in place as the cloud thins to
 * the veil; district to district it slides at full strength.
 */
export function deckLeg(current: Deck, target: Deck): { from: Deck; to: Deck } {
  if (!target.hole) {
    if (current.hole && isOpen(current)) {
      return { from: current, to: { hole: closeHole(current.hole), strength: target.strength } }
    }
    return { from: current, to: target }
  }
  if (!isOpen(current)) {
    return { from: { hole: closeHole(target.hole), strength: current.strength }, to: target }
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

/** Two decks that look the same: equal strength, and both closed or the same open hole. */
export function sameDeck(a: Deck, b: Deck): boolean {
  if (a.strength !== b.strength) return false
  const openA = isOpen(a)
  const openB = isOpen(b)
  if (!openA && !openB) return true
  return openA && openB && areaKey(a.hole) === areaKey(b.hole)
}

/** The drift distance after `seconds` more; unbounded (see `driftWrap` for the shader). */
export function driftStep(along: number, seconds: number): number {
  return along + seconds * CLOUD_DECK_DRIFT
}

/** The drift as the shader takes it: wrapped at CLOUD_DECK_DRIFT_WRAP (spec 23.8). */
export function driftWrap(along: number): number {
  return ((along % CLOUD_DECK_DRIFT_WRAP) + CLOUD_DECK_DRIFT_WRAP) % CLOUD_DECK_DRIFT_WRAP
}
