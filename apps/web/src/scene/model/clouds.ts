import type { Focus } from '../../world/selectors'
import { CLOUD_BAND, CLOUD_DENSITY, CLOUD_DISTRICT_RING, CLOUD_MAX } from '../tuning'
import type { Area } from './area'
import { AREA_MARGIN, layerArea } from './camera'
import { SHALLOWS_MARGIN } from './hex-space'
import { hashInts, mulberry32 } from './random'
import type { SceneModel } from './scene-model'

/** The area a ring surrounds, how far outside it the band starts, and the ring's seed (spec 21.1). */
export type CloudArea = { area: Area; inset: number; seed: number }

/** One puff on the ground it appears over, with its outward direction (unit) from the ring. */
export type CloudPuff = {
  x: number
  z: number
  nx: number
  nz: number
  scale: number
  turn: number
  /** 0–1: staggers its gather and part, and offsets its sway and bob. */
  phase: number
}

const CLOUD_SALT = 7919

/** Which ring the current layer gets: none on the archipelago (spec 21.1). */
export function cloudArea(model: SceneModel, focus: Focus): CloudArea | null {
  if (focus.kind === 'archipelago') return null
  const island = model.islands.find((i) => i.projectId === focus.projectId)
  if (!island) return null
  const islandFocus: Focus = { kind: 'island', projectId: island.projectId }
  const islandArea = layerArea(model, islandFocus)
  const coast = islandArea ? { area: islandArea, inset: SHALLOWS_MARGIN, seed: island.seed } : null
  if (focus.kind === 'island' || CLOUD_DISTRICT_RING === 'coast') return coast
  const index = island.districts.findIndex((d) => d.milestoneId === focus.milestoneId)
  const area = layerArea(model, focus)
  if (index < 0 || !area) return coast
  return { area, inset: AREA_MARGIN, seed: hashInts(island.seed, index + 1) }
}

type Spot = { x: number; z: number; nx: number; nz: number }
type Segment = { length: number; at: (t: number) => Spot }

/** The band's middle line: the area grown by `r`, as four sides and four quarter circles. */
function ringPath(a: Area, r: number): Segment[] {
  const w = a.maxX - a.minX
  const h = a.maxZ - a.minZ
  const side = (x: number, z: number, dx: number, dz: number, length: number): Segment => ({
    length,
    at: (t) => ({ x: x + dx * t * length, z: z + dz * t * length, nx: dz, nz: -dx }),
  })
  const corner = (cx: number, cz: number, from: number): Segment => ({
    length: (Math.PI / 2) * r,
    at: (t) => {
      const angle = from + (t * Math.PI) / 2
      const nx = Math.cos(angle)
      const nz = Math.sin(angle)
      return { x: cx + nx * r, z: cz + nz * r, nx, nz }
    },
  })
  return [
    side(a.minX, a.minZ - r, 1, 0, w),
    corner(a.maxX, a.minZ, -Math.PI / 2),
    side(a.maxX + r, a.minZ, 0, 1, h),
    corner(a.maxX, a.maxZ, 0),
    side(a.maxX, a.maxZ + r, -1, 0, w),
    corner(a.minX, a.maxZ, Math.PI / 2),
    side(a.minX - r, a.maxZ, 0, -1, h),
    corner(a.minX, a.minZ, Math.PI),
  ]
}

function pointAt(path: readonly Segment[], s: number): Spot {
  let rest = s
  for (const [i, seg] of path.entries()) {
    if (rest <= seg.length || i === path.length - 1) {
      return seg.at(seg.length === 0 ? 0 : Math.min(1, rest / seg.length))
    }
    rest -= seg.length
  }
  throw new Error('cloudRing: empty path')
}

const middleRadius = (c: CloudArea) => (c.area.round ?? 0) + c.inset + CLOUD_BAND / 2

/** The length of the band's middle line, in world units. */
export function ringLength(c: CloudArea): number {
  return ringPath(c.area, middleRadius(c)).reduce((sum, seg) => sum + seg.length, 0)
}

/** The puffs of one ring: spread evenly along the band, jittered by a seeded hash (spec 21.1). */
export function cloudRing(c: CloudArea): CloudPuff[] {
  const path = ringPath(c.area, middleRadius(c))
  const total = path.reduce((sum, seg) => sum + seg.length, 0)
  const count = Math.min(CLOUD_MAX, Math.round(total * CLOUD_DENSITY))
  return Array.from({ length: count }, (_, i): CloudPuff => {
    const random = mulberry32(hashInts(c.seed, i, CLOUD_SALT))
    const p = pointAt(path, ((i + random()) / count) * total)
    const across = (random() - 0.5) * CLOUD_BAND * 0.8
    return {
      x: p.x + p.nx * across,
      z: p.z + p.nz * across,
      nx: p.nx,
      nz: p.nz,
      scale: 0.8 + random() * 0.6,
      turn: random() * Math.PI * 2,
      phase: random(),
    }
  })
}
