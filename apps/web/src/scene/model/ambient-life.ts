import type { WorldDto } from '@archipelago/shared'
import {
  BOAT_SPEED,
  FOAM_OPACITY,
  FOAM_PULSE,
  FOAM_PULSE_S,
  GULL_ORBIT,
  GULL_SPEED,
  WHALE_BREACH_S,
  WHALE_CLEARANCE,
  WHALE_INTERVAL_S,
} from '../tuning'
import { islandExtent, type Point, SHALLOWS_MARGIN } from './hex-space'
import { hashInts, hashString, mulberry32 } from './random'
import type { SceneModel } from './scene-model'
import { type Route, seaRoutes } from './sea-routes'

export type Boat = { route: Route; phase: number }
export type GullFlock = { projectId: string; center: Point; radius: number; phase: number }
export type Whale = { spot: Point; turn: number; interval: number; phase: number }
export type AmbientLife = { boats: Boat[]; flocks: GullFlock[]; whale: Whale | null }
export type Pose = { position: Point; heading: number }
export type WhalePose = { visible: boolean; y: number; pitch: number; splash: number }

export const NO_LIFE: AmbientLife = { boats: [], flocks: [], whale: null }
export const MAX_BOATS = 4
export const TASKS_PER_BOAT = 3
export const MAX_FLOCKS = 3
export const GULLS_PER_FLOCK = 3
const DAY_MS = 86_400_000
export const BOAT_WINDOW_MS = 7 * DAY_MS
export const GULL_WINDOW_MS = DAY_MS

export const boatCount = (done: number): number =>
  Math.min(MAX_BOATS, Math.ceil(done / TASKS_PER_BOAT))

export const hasLife = (life: AmbientLife): boolean =>
  life.boats.length > 0 || life.flocks.length > 0 || life.whale !== null

/** Heading (radians about y) that turns a model facing +x to travel along (dx, dz). */
const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx)

/**
 * Progress made visible at sea (spec 17.5). Seeds come from ids and routes, never list order,
 * so boat i keeps its route and phase when a later completion adds boat i+1.
 */
export function buildAmbientLife(scene: SceneModel, world: WorldDto, now: number): AmbientLife {
  const onScene = new Set(scene.islands.map((i) => i.projectId))
  // A stamp slightly ahead of this clock (server time) still counts: only age is checked.
  const completions = world.tasks.flatMap((t) =>
    t.status === 'done' && t.completedAt && onScene.has(t.projectId)
      ? [{ projectId: t.projectId, at: Date.parse(t.completedAt) }]
      : [],
  )
  const within = (ms: number) => completions.filter((c) => now - c.at <= ms)

  const routes = seaRoutes(scene)
  const count = routes.length > 0 ? boatCount(within(BOAT_WINDOW_MS).length) : 0
  const start = routes[0] ? hashString(routes[0].key) % routes.length : 0
  const boats = Array.from({ length: count }, (_, i): Boat => {
    const route = routes[(start + i) % routes.length] as Route
    return { route, phase: mulberry32(hashInts(i, hashString(route.key)))() }
  })

  const latest = new Map<string, number>()
  for (const c of within(GULL_WINDOW_MS)) {
    latest.set(c.projectId, Math.max(latest.get(c.projectId) ?? -Infinity, c.at))
  }
  const flocks = [...latest]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_FLOCKS)
    .flatMap(([projectId]): GullFlock[] => {
      const island = scene.islands.find((i) => i.projectId === projectId)
      if (!island) return []
      return [
        {
          projectId,
          center: island.origin,
          radius: islandExtent(island.radius) * GULL_ORBIT,
          phase: mulberry32(hashString(projectId))(),
        },
      ]
    })

  return { boats, flocks, whale: world.economy.streak.activeToday ? whaleFor(scene) : null }
}

/** Beyond every island: past the bounds' half-diagonal, its shallows, and the clearance. */
function whaleFor({ islands, bounds }: SceneModel): Whale {
  const ids = islands
    .map((i) => i.projectId)
    .sort()
    .join('|')
  const random = mulberry32(hashString(ids))
  const halfW = (bounds.maxX - bounds.minX) / 2
  const halfD = (bounds.maxZ - bounds.minZ) / 2
  const distance = Math.hypot(halfW, halfD) + SHALLOWS_MARGIN + WHALE_CLEARANCE
  const angle = random() * Math.PI * 2
  const [min, max] = WHALE_INTERVAL_S
  return {
    spot: {
      x: bounds.minX + halfW + Math.cos(angle) * distance,
      z: bounds.minZ + halfD + Math.sin(angle) * distance,
    },
    interval: min + random() * (max - min),
    phase: random(),
    turn: random() * Math.PI * 2,
  }
}

/** Where a boat is `t` seconds into its voyage; t = 0 is its frozen pose. */
export function boatPose({ route, phase }: Boat, t: number): Pose {
  if (route.kind === 'loop') {
    const turns = phase + (t * BOAT_SPEED) / (2 * Math.PI * route.radius)
    const a = (turns % 1) * 2 * Math.PI
    return {
      position: {
        x: route.center.x + route.radius * Math.cos(a),
        z: route.center.z + route.radius * Math.sin(a),
      },
      heading: headingOf(-Math.sin(a), Math.cos(a)),
    }
  }
  const dx = route.to.x - route.from.x
  const dz = route.to.z - route.from.z
  const length = Math.hypot(dx, dz)
  const u = (phase + (t * BOAT_SPEED) / (2 * length)) % 1
  const out = u < 0.5
  const s = out ? u * 2 : 2 - u * 2
  return {
    position: { x: route.from.x + dx * s, z: route.from.z + dz * s },
    heading: out ? headingOf(dx, dz) : headingOf(-dx, -dz),
  }
}

/** Gull `k` of a flock, spread a third of a circle apart. */
export function gullPose(flock: GullFlock, k: number, t: number): Pose {
  const a = 2 * Math.PI * (flock.phase + k / GULLS_PER_FLOCK) + (t * GULL_SPEED) / flock.radius
  return {
    position: {
      x: flock.center.x + flock.radius * Math.cos(a),
      z: flock.center.z + flock.radius * Math.sin(a),
    },
    heading: headingOf(-Math.sin(a), Math.cos(a)),
  }
}

/** A breach: up out of the water and back over `WHALE_BREACH_S`, once per interval. */
export function whalePose(whale: Whale, t: number): WhalePose {
  const cycle = (whale.phase * whale.interval + t) % whale.interval
  if (cycle > WHALE_BREACH_S) return { visible: false, y: 0, pitch: 0, splash: 0 }
  const s = cycle / WHALE_BREACH_S
  return { visible: true, y: -0.6 + Math.sin(Math.PI * s) * 1.0, pitch: (0.5 - s) * 1.2, splash: s }
}

export const foamOpacity = (t: number): number =>
  FOAM_OPACITY + FOAM_PULSE * Math.sin((2 * Math.PI * t) / FOAM_PULSE_S)
