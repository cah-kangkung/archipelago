import { describe, expect, test } from 'vitest'
import { CLOUD_BOB, CLOUD_HEIGHT, CLOUD_MS, CLOUD_SWAY, CLOUD_TRAVEL } from '../tuning'
import {
  type CloudLeg,
  legDone,
  legFrames,
  nextLeg,
  puffProgress,
  restFrames,
  stillFrames,
} from './cloud-motion'
import type { CloudPuff } from './clouds'

const puff = (over: Partial<CloudPuff> = {}): CloudPuff => ({
  x: 10,
  z: 0,
  nx: 1,
  nz: 0,
  scale: 1.2,
  turn: 0.5,
  phase: 0,
  ...over,
})
const a = puff()
const b = puff({ x: 0, z: 10, nx: 0, nz: 1, phase: 1 })

/** The isometric camera looks down (1, 1, 1): a point at height y shows over ground (x − y, z − y). */
const ground = (f: { x: number; y: number; z: number }, lift = 0) => ({
  x: f.x - (f.y - lift),
  z: f.z - (f.y - lift),
})

describe('cloud motion', () => {
  test('each puff runs its own staggered window inside CLOUD_MS', () => {
    expect(puffProgress(a, 0)).toBe(0)
    expect(puffProgress(a, CLOUD_MS * 0.75)).toBe(1)
    expect(puffProgress(b, CLOUD_MS * 0.25)).toBe(0)
    expect(puffProgress(b, CLOUD_MS * 0.5)).toBeGreaterThan(0)
    expect(puffProgress(b, CLOUD_MS)).toBe(1)
  })

  test('a still puff floats CLOUD_HEIGHT up, drawn over its own ground point', () => {
    const [f] = stillFrames([a])
    expect(f?.y).toBe(CLOUD_HEIGHT)
    expect(f && ground(f)).toEqual({ x: a.x, z: a.z })
    expect(f?.scale).toBe(a.scale)
    expect(f?.turn).toBe(a.turn)
  })

  test('gathering grows from nothing while gliding in from CLOUD_TRAVEL out', () => {
    const leg: CloudLeg = { leaving: [], arriving: [a], elapsed: 0 }
    const [start] = legFrames(leg)
    expect(start?.scale).toBe(0)
    expect(start && ground(start).x).toBeCloseTo(a.x + CLOUD_TRAVEL)
    const [end] = legFrames({ ...leg, elapsed: CLOUD_MS })
    expect(end).toEqual(stillFrames([a])[0])
    expect(legDone({ ...leg, elapsed: CLOUD_MS })).toBe(true)
    expect(legDone({ ...leg, elapsed: CLOUD_MS - 1 })).toBe(false)
  })

  test('parting shrinks from its share and drifts out; a finished part draws nothing', () => {
    const leg: CloudLeg = { leaving: [{ puff: a, from: 1 }], arriving: [], elapsed: 0 }
    expect(legFrames(leg)).toEqual(stillFrames([a]))
    const mid = legFrames({ ...leg, elapsed: CLOUD_MS * 0.3 })[0]
    expect(mid?.scale).toBeLessThan(a.scale)
    expect(mid && ground(mid).x).toBeGreaterThan(a.x)
    expect(legFrames({ ...leg, elapsed: CLOUD_MS })).toEqual([])
  })

  test('from rest, the whole shown ring parts at full size while the next gathers', () => {
    const leg = nextLeg(null, [a], [b], 10)
    expect(leg).toEqual({ leaving: [{ puff: a, from: 1 }], arriving: [b], elapsed: 0 })
  })

  test('interrupted mid-gather, half-grown puffs part from the size they reached', () => {
    const current: CloudLeg = { leaving: [], arriving: [a], elapsed: CLOUD_MS * 0.3 }
    const reached = puffProgress(a, current.elapsed)
    const leg = nextLeg(current, [a], [b], 10)
    expect(leg.leaving).toEqual([{ puff: a, from: reached }])
    // No pop: the first frame of the new leg draws `a` exactly as the old leg's last frame did.
    expect(legFrames(leg)[0]).toEqual(legFrames(current)[0])
  })

  test('the next leg fits the capacity: arriving first, then the largest leaving shares', () => {
    const many = Array.from({ length: 6 }, (_, i) => puff({ x: i }))
    const leg = nextLeg(null, many, [b, b], 5)
    expect(leg.arriving).toHaveLength(2)
    expect(leg.leaving).toHaveLength(3)
    const fading: CloudLeg = {
      leaving: [{ puff: a, from: 0.01 }],
      arriving: [],
      elapsed: 0,
    }
    expect(nextLeg(fading, [], [b], 5).leaving).toEqual([])
  })

  test('at rest the drift starts from still and stays within its sway and bob', () => {
    expect(restFrames([a, b], 0)).toEqual(stillFrames([a, b]))
    for (const t of [1, 5, 13, 40]) {
      const [f] = restFrames([a], t)
      if (!f) throw new Error('no frame')
      const bob = f.y - CLOUD_HEIGHT
      expect(Math.abs(bob)).toBeLessThanOrEqual(2 * CLOUD_BOB + 1e-9)
      const g = ground(f, bob)
      // `a` faces +x, so its sway runs along z.
      expect(g.x).toBeCloseTo(a.x)
      expect(Math.abs(g.z - a.z)).toBeLessThanOrEqual(2 * CLOUD_SWAY + 1e-9)
    }
    expect(restFrames([a], 5)).not.toEqual(stillFrames([a]))
  })
})
