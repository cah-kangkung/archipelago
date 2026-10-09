import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import type { Focus } from '../../world/selectors'
import {
  ARCHIPELAGO_ZOOM,
  AREA_MARGIN,
  cameraTarget,
  DISTRICT_MARGIN,
  DISTRICT_ZOOM,
  FIT_MARGIN,
  fitZoom,
  focusOutline,
  ISLAND_ZOOM,
  layerArea,
  panArea,
} from './camera'
import { islandExtent, shallowsRadius } from './hex-space'
import { buildSceneModel } from './scene-model'
import { toScreen } from './screen'

const today = '2026-10-08'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0, islandSeed: 8 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0, islandSeed: 8 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const empty = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const inMvp = [
  fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 }),
  fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 4, plotY: 1 }),
]
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [mvp, empty],
  tasks: inMvp,
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const island = model.islands.find((i) => i.projectId === beta.id)
if (!island) throw new Error('no beta')
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onEmpty: Focus = { kind: 'district', projectId: beta.id, milestoneId: empty.id }

/** Screen span (px per unit of zoom) of an outline. */
function span(outline: { x: number; z: number }[]) {
  const pts = outline.map((p) => toScreen(p.x, p.z, 1))
  const xs = pts.map((p) => p.sx)
  const ys = pts.map((p) => p.sy)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('focusOutline and fitZoom', () => {
  test('an island outline is 12 points on its shallows circle', () => {
    const outline = focusOutline(model, onBeta)
    expect(outline).toHaveLength(12)
    for (const p of outline) {
      expect(Math.hypot(p.x - island.origin.x, p.z - island.origin.z)).toBeCloseTo(
        shallowsRadius(island.radius),
      )
    }
  })

  test('a district outline is its area box grown by DISTRICT_MARGIN', () => {
    const a = layerArea(model, onMvp)
    if (!a) throw new Error('no mvp area')
    const xs = focusOutline(model, onMvp).map((p) => p.x)
    const zs = focusOutline(model, onMvp).map((p) => p.z)
    expect(Math.min(...xs)).toBeCloseTo(a.minX - DISTRICT_MARGIN)
    expect(Math.max(...xs)).toBeCloseTo(a.maxX + DISTRICT_MARGIN)
    expect(Math.min(...zs)).toBeCloseTo(a.minZ - DISTRICT_MARGIN)
    expect(Math.max(...zs)).toBeCloseTo(a.maxZ + DISTRICT_MARGIN)
  })

  test('fitZoom is 0 without a viewport, and otherwise fits every point with the margin', () => {
    const outline = focusOutline(model, onBeta)
    expect(fitZoom(outline)).toBe(0)
    const viewport = { width: 1400, height: 800 }
    const zoom = fitZoom(outline, viewport)
    const { w, h } = span(outline)
    expect(w * zoom).toBeLessThanOrEqual(viewport.width * FIT_MARGIN + 1e-6)
    expect(h * zoom).toBeLessThanOrEqual(viewport.height * FIT_MARGIN + 1e-6)
    // Tight on at least one axis.
    expect(Math.max((w * zoom) / viewport.width, (h * zoom) / viewport.height)).toBeCloseTo(
      FIT_MARGIN,
    )
    expect(fitZoom(outline, { width: 2800, height: 1600 })).toBeCloseTo(zoom * 2)
  })
})

describe('cameraTarget with a viewport', () => {
  test('without a viewport the zooms are the floors, as before', () => {
    expect(cameraTarget(model, onBeta).zoom).toBe(ISLAND_ZOOM)
    expect(cameraTarget(model, onMvp).zoom).toBe(DISTRICT_ZOOM)
    expect(cameraTarget(model, { kind: 'archipelago' }).zoom).toBe(ARCHIPELAGO_ZOOM)
  })

  test('a roomy viewport fits the island; a cramped one stops at the floor', () => {
    const roomy = { width: 4000, height: 3000 }
    const fitted = cameraTarget(model, onBeta, null, roomy)
    expect(fitted.zoom).toBeCloseTo(fitZoom(focusOutline(model, onBeta), roomy))
    expect(fitted.zoom).toBeGreaterThan(ISLAND_ZOOM)
    expect(cameraTarget(model, onBeta, null, { width: 300, height: 300 }).zoom).toBe(ISLAND_ZOOM)
    expect(cameraTarget(model, onMvp, null, { width: 300, height: 300 }).zoom).toBe(DISTRICT_ZOOM)
  })

  test('a district target is the centre of its box', () => {
    const a = layerArea(model, onMvp)
    if (!a) throw new Error('no mvp area')
    const t = cameraTarget(model, onMvp, null, { width: 1000, height: 800 })
    expect(t.x).toBeCloseTo((a.minX + a.maxX) / 2)
    expect(t.z).toBeCloseTo((a.minZ + a.maxZ) / 2)
  })
})

describe('layerArea and panArea', () => {
  test('the archipelago has no layer area; its pan area is the world box', () => {
    expect(layerArea(model, { kind: 'archipelago' })).toBeNull()
    expect(panArea(model, { kind: 'archipelago' })).toEqual(model.bounds)
  })

  test('an island is a circle out to its coastline', () => {
    const { x, z } = island.origin
    expect(layerArea(model, onBeta)).toEqual({
      minX: x,
      maxX: x,
      minZ: z,
      maxZ: z,
      round: islandExtent(island.radius),
    })
    expect(panArea(model, onBeta)).toEqual(layerArea(model, onBeta))
  })

  test('a district is the box round its landmark and plots, with half a hex of round', () => {
    const district = island.districts.find((d) => d.milestoneId === mvp.id)
    if (!district) throw new Error('no mvp district')
    const spots = [
      district.position,
      ...island.structures.filter((s) => s.milestoneId === mvp.id).map((s) => s.position),
    ]
    const xs = spots.map((p) => island.origin.x + p.x)
    const zs = spots.map((p) => island.origin.z + p.z)
    expect(layerArea(model, onMvp)).toEqual({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      round: AREA_MARGIN,
    })
  })

  test('a district with no tasks is its landmark alone, with half a hex of round', () => {
    const d = island.districts.find((x) => x.milestoneId === empty.id)
    if (!d) throw new Error('no empty district')
    const x = island.origin.x + d.position.x
    const z = island.origin.z + d.position.z
    expect(layerArea(model, onEmpty)).toEqual({
      minX: x,
      maxX: x,
      minZ: z,
      maxZ: z,
      round: AREA_MARGIN,
    })
  })

  test('unknown ids fall back a level', () => {
    expect(layerArea(model, { kind: 'island', projectId: 'nope' })).toBeNull()
    expect(layerArea(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' })).toEqual(
      layerArea(model, onBeta),
    )
  })
})
