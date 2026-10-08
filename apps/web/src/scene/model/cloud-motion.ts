import {
  CLOUD_BOB,
  CLOUD_BOB_S,
  CLOUD_HEIGHT,
  CLOUD_MS,
  CLOUD_SWAY,
  CLOUD_SWAY_S,
  CLOUD_TRAVEL,
} from '../tuning'
import { easeOutCubic } from './camera-motion'
import type { CloudPuff } from './clouds'

/** One puff as drawn: position (world), size and turn. */
export type CloudFrame = { x: number; y: number; z: number; scale: number; turn: number }
/** A puff on its way out, from the share of its size it had when its ring was replaced. */
export type Leaving = { puff: CloudPuff; from: number }
/** A ring change: the old puffs parting while the new ones gather (spec 21.3). */
export type CloudLeg = { leaving: Leaving[]; arriving: CloudPuff[]; elapsed: number }

/** Each puff starts up to this share of CLOUD_MS late, by its phase. */
const STAGGER = 0.25
/** Leaving puffs smaller than this share are dropped from the next leg. */
const MIN_SHARE = 0.05
const TAU = Math.PI * 2

/** How far through its own staggered window a puff is, `elapsed` ms into a leg, eased (0–1). */
export function puffProgress(puff: CloudPuff, elapsed: number): number {
  const start = puff.phase * STAGGER * CLOUD_MS
  const t = (elapsed - start) / ((1 - STAGGER) * CLOUD_MS)
  return easeOutCubic(Math.min(1, Math.max(0, t)))
}

/**
 * A puff at `share` of its size, pushed `out` along its outward direction and `along` the ring,
 * lifted by `bob`. Drawn at (x + h, h, z + h): the isometric camera looks down (1, 1, 1), so that
 * shows over the ground point (x, z) (spec 21.2).
 */
function frame(p: CloudPuff, share: number, out: number, along = 0, bob = 0): CloudFrame {
  const x = p.x + p.nx * out - p.nz * along
  const z = p.z + p.nz * out + p.nx * along
  return {
    x: x + CLOUD_HEIGHT,
    y: CLOUD_HEIGHT + bob,
    z: z + CLOUD_HEIGHT,
    scale: p.scale * share,
    turn: p.turn,
  }
}

export function legFrames(leg: CloudLeg): CloudFrame[] {
  const frames: CloudFrame[] = []
  for (const { puff, from } of leg.leaving) {
    const share = from * (1 - puffProgress(puff, leg.elapsed))
    if (share > 0) frames.push(frame(puff, share, CLOUD_TRAVEL * (1 - share)))
  }
  for (const puff of leg.arriving) {
    const e = puffProgress(puff, leg.elapsed)
    frames.push(frame(puff, e, CLOUD_TRAVEL * (1 - e)))
  }
  return frames
}

export function legDone(leg: CloudLeg): boolean {
  return leg.elapsed >= CLOUD_MS
}

export function stillFrames(ring: readonly CloudPuff[]): CloudFrame[] {
  return ring.map((p) => frame(p, 1, 0))
}

/** Resting drift, `time` s after it began: a slow sway along the ring and a bob, both 0 at 0. */
export function restFrames(ring: readonly CloudPuff[], time: number): CloudFrame[] {
  const wave = (period: number, phase: number) =>
    Math.sin(TAU * (time / period + phase)) - Math.sin(TAU * phase)
  return ring.map((p) =>
    frame(
      p,
      1,
      0,
      CLOUD_SWAY * wave(CLOUD_SWAY_S, p.phase),
      CLOUD_BOB * wave(CLOUD_BOB_S, p.phase),
    ),
  )
}

/**
 * The leg that replaces what is on screen with the `next` ring: from rest, the `shown` ring parts
 * at full size; mid-leg, every visible puff parts from the share it has reached. Fits `capacity`,
 * keeping every arriving puff and the largest leaving ones.
 */
export function nextLeg(
  current: CloudLeg | null,
  shown: readonly CloudPuff[],
  next: readonly CloudPuff[],
  capacity: number,
): CloudLeg {
  const visible: Leaving[] = current
    ? [
        ...current.leaving.map((l) => ({
          puff: l.puff,
          from: l.from * (1 - puffProgress(l.puff, current.elapsed)),
        })),
        ...current.arriving.map((p) => ({ puff: p, from: puffProgress(p, current.elapsed) })),
      ]
    : shown.map((p) => ({ puff: p, from: 1 }))
  const room = Math.max(0, capacity - next.length)
  const leaving = visible
    .filter((l) => l.from > MIN_SHARE)
    .sort((x, y) => y.from - x.from)
    .slice(0, room)
  return { leaving, arriving: [...next], elapsed: 0 }
}
