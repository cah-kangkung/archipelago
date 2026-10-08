import {
  type Hex,
  hexDistance,
  hexKey,
  hexRing,
  nextArchipelagoSlot,
  type WorldDto,
} from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeBuilding, fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { addDays } from '../../world/selectors'
import {
  ARCHIPELAGO_ZOOM,
  cameraTarget,
  clampToBounds,
  DISTRICT_ZOOM,
  focusKey,
  ISLAND_ZOOM,
  openingIsland,
} from './camera'
import { hexToWorld, islandExtent, LAND_HEIGHT, SQRT3 } from './hex-space'
import { pathHexes } from './island-growth'
import { mulberry32 } from './random'
import { buildSceneModel } from './scene-model'
import { landmarkFor, solidSegments, structureFor } from './state'
import { heightAt, tileHeights } from './terrain'

const today = '2026-10-07'
const world = (w: Partial<WorldDto>): WorldDto => ({
  projects: [],
  milestones: [],
  tasks: [],
  buildings: [],
  economy: {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  },
  ...w,
})

type Island = ReturnType<typeof buildSceneModel>['islands'][number]
/** Where something on `h` stands: its hex centre at its tile's height. */
const spotOf = (island: Island | undefined, h: Hex) => {
  if (!island) throw new Error('no island')
  return { ...hexToWorld(h), y: heightAt(tileHeights(island.tiles), h) }
}

describe('structureFor', () => {
  test('maps status and size to a structure kind', () => {
    expect(structureFor({ status: 'todo', size: 'L', dueDate: null }, today).kind).toBe('scaffold')
    expect(structureFor({ status: 'doing', size: 'S', dueDate: null }, today).kind).toBe('crane')
    expect(structureFor({ status: 'done', size: 'S', dueDate: null }, today).kind).toBe('hut')
    expect(structureFor({ status: 'done', size: 'M', dueDate: null }, today).kind).toBe('house')
    expect(structureFor({ status: 'done', size: 'L', dueDate: null }, today).kind).toBe('workshop')
  })

  test('marks overdue with a storm and due within 48h with a lantern, never when done', () => {
    const at = (dueDate: string, status: 'todo' | 'done' = 'todo') =>
      structureFor({ status, size: 'M', dueDate }, today).marker
    expect(at(addDays(today, -1))).toBe('storm')
    expect(at(today)).toBe('lantern')
    expect(at(addDays(today, 1))).toBe('lantern')
    expect(at(addDays(today, 2))).toBeNull()
    expect(at(addDays(today, -1), 'done')).toBeNull()
  })

  test("uses the caller's local today, not UTC", () => {
    // 2026-10-07 is already "today" in Jakarta even if UTC is still on the 6th.
    expect(
      structureFor({ status: 'todo', size: 'M', dueDate: '2026-10-06' }, '2026-10-07').marker,
    ).toBe('storm')
    expect(
      structureFor({ status: 'todo', size: 'M', dueDate: '2026-10-06' }, '2026-10-06').marker,
    ).toBe('lantern')
  })
})

describe('landmarkFor and solidSegments', () => {
  const m = fakeMilestone({ landmarkType: 'windmill' })
  test('progress is done ÷ total, 0 with no tasks, 1 once completed', () => {
    expect(landmarkFor(m, [])).toEqual({ type: 'windmill', progress: 0 })
    expect(
      landmarkFor(m, [
        { status: 'done' },
        { status: 'todo' },
        { status: 'doing' },
        { status: 'done' },
      ]).progress,
    ).toBe(0.5)
    expect(landmarkFor({ ...m, completedAt: '2026-10-07T00:00:00.000Z' }, []).progress).toBe(1)
  })
  test('solid segments round up and never exceed n', () => {
    expect(solidSegments(0, 4)).toBe(0)
    expect(solidSegments(0.1, 4)).toBe(1)
    expect(solidSegments(0.5, 4)).toBe(2)
    expect(solidSegments(1, 4)).toBe(4)
  })
})

describe('buildSceneModel', () => {
  test('an empty world has no islands and default bounds', () => {
    expect(buildSceneModel(world({}), today)).toEqual({
      islands: [],
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    })
  })

  test('places structures and districts at their hexes, island-local', () => {
    const p = fakeProject({ name: 'Beta', islandSeed: 9 })
    const m = fakeMilestone({
      projectId: p.id,
      name: 'MVP',
      landmarkType: 'market',
      districtQ: 5,
      districtR: 0,
    })
    const t = fakeTask({
      projectId: p.id,
      milestoneId: m.id,
      plotX: 4,
      plotY: 1,
      status: 'done',
      size: 'L',
    })
    const [island] = buildSceneModel(
      world({ projects: [p], milestones: [m], tasks: [t] }),
      today,
    ).islands
    expect(island?.name).toBe('Beta')
    expect(island?.seed).toBe(9)
    expect(island?.radius).toBe(7)
    expect(island?.origin).toEqual({ x: 0, z: 0 })
    expect(island?.districts).toEqual([
      {
        milestoneId: m.id,
        name: 'MVP',
        type: 'market',
        progress: 1,
        position: spotOf(island, { q: 5, r: 0 }),
      },
    ])
    expect(island?.structures).toEqual([
      {
        taskId: t.id,
        milestoneId: m.id,
        kind: 'workshop',
        marker: null,
        position: spotOf(island, { q: 4, r: 1 }),
      },
    ])
  })

  test('far districts and negative plots stand on interior land at their tile height', () => {
    const p = fakeProject()
    const m = fakeMilestone({ projectId: p.id, districtQ: -10, districtR: 5 })
    const tasks = [
      fakeTask({ projectId: p.id, milestoneId: m.id, plotX: -11, plotY: 5 }),
      fakeTask({ projectId: p.id, plotX: -1, plotY: -2 }),
    ]
    const [island] = buildSceneModel(
      world({ projects: [p], milestones: [m], tasks }),
      today,
    ).islands
    const occupied: Hex[] = [
      { q: -10, r: 5 },
      { q: -11, r: 5 },
      { q: -1, r: -2 },
    ]
    for (const h of occupied) {
      const tile = island?.tiles.find((t) => t.q === h.q && t.r === h.r)
      expect(tile?.height).toBeGreaterThanOrEqual(LAND_HEIGHT)
    }
    expect(island?.districts[0]?.position).toEqual(spotOf(island, { q: -10, r: 5 }))
    expect(island?.structures.map((s) => s.position)).toEqual([
      spotOf(island, { q: -11, r: 5 }),
      spotOf(island, { q: -1, r: -2 }),
    ])
  })

  test('islands never overlap, however large one grows', () => {
    const random = mulberry32(2026)
    for (let round = 0; round < 25; round++) {
      const taken = new Set<string>()
      const projects = Array.from({ length: 1 + Math.floor(random() * 7) }, () => {
        const slot = nextArchipelagoSlot(taken)
        taken.add(hexKey(slot))
        return fakeProject({ archipelagoX: slot.q, archipelagoY: slot.r })
      })
      const tasks = projects.flatMap((p) =>
        Array.from({ length: Math.floor(random() * 6) }, () =>
          fakeTask({
            projectId: p.id,
            plotX: Math.floor(random() * 25) - 12,
            plotY: Math.floor(random() * 25) - 12,
          }),
        ),
      )
      const { islands, bounds } = buildSceneModel(world({ projects, tasks }), today)
      islands.forEach((a, i) => {
        expect(a.origin.x - islandExtent(a.radius)).toBeGreaterThanOrEqual(bounds.minX)
        expect(a.origin.x + islandExtent(a.radius)).toBeLessThanOrEqual(bounds.maxX)
        expect(a.origin.z - islandExtent(a.radius)).toBeGreaterThanOrEqual(bounds.minZ)
        expect(a.origin.z + islandExtent(a.radius)).toBeLessThanOrEqual(bounds.maxZ)
        for (const b of islands.slice(i + 1)) {
          const gap = Math.hypot(a.origin.x - b.origin.x, a.origin.z - b.origin.z)
          expect(gap).toBeGreaterThanOrEqual(islandExtent(a.radius) + islandExtent(b.radius))
        }
      })
    }
  })

  test('every task plot lies within its island radius', () => {
    const p = fakeProject()
    const t = fakeTask({ projectId: p.id, plotX: 3, plotY: -6 })
    const [island] = buildSceneModel(world({ projects: [p], tasks: [t] }), today).islands
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -6 })).toBeLessThanOrEqual(
      (island?.radius ?? 0) - 2,
    )
  })
})

describe('camera', () => {
  test('zooms meet the readability floors in spec 13.4', () => {
    expect(2 * islandExtent(4) * ARCHIPELAGO_ZOOM).toBeGreaterThanOrEqual(120)
    expect(SQRT3 * ISLAND_ZOOM).toBeGreaterThanOrEqual(56) // hex width on screen
    expect(ISLAND_ZOOM).toBeGreaterThanOrEqual(44) // hex footprint height at true isometric ≈ 1 unit
    expect(DISTRICT_ZOOM).toBe(ISLAND_ZOOM * 1.5)
  })

  test('targets the bounds centre, the island origin, or the district centre', () => {
    const p = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
    const home = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const model = buildSceneModel(world({ projects: [home, p], milestones: [m] }), today)
    const island = model.islands.find((i) => i.projectId === p.id)
    const { bounds } = model

    expect(cameraTarget(model, { kind: 'archipelago' })).toEqual({
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
      zoom: ARCHIPELAGO_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'island', projectId: p.id })).toEqual({
      ...island?.origin,
      zoom: ISLAND_ZOOM,
    })
    const d = hexToWorld({ q: 5, r: 0 })
    expect(cameraTarget(model, { kind: 'district', projectId: p.id, milestoneId: m.id })).toEqual({
      x: (island?.origin.x ?? 0) + d.x,
      z: (island?.origin.z ?? 0) + d.z,
      zoom: DISTRICT_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'island', projectId: 'missing' }).zoom).toBe(
      ARCHIPELAGO_ZOOM,
    )
  })

  test('clampToBounds keeps the pan target inside the world', () => {
    const b = { minX: -5, maxX: 5, minZ: -2, maxZ: 2 }
    expect(clampToBounds(b, 9, -9)).toEqual({ x: 5, z: -2 })
    expect(clampToBounds(b, 1, 1)).toEqual({ x: 1, z: 1 })
  })

  test('focusKey changes with the route, not with the world', () => {
    expect(focusKey({ kind: 'archipelago' })).toBe('archipelago')
    expect(focusKey({ kind: 'island', projectId: 'a' })).toBe('island:a')
    expect(focusKey({ kind: 'district', projectId: 'a', milestoneId: 'm' })).toBe('district:a:m')
    expect(focusKey({ kind: 'island', projectId: 'a' })).not.toBe(
      focusKey({ kind: 'island', projectId: 'b' }),
    )
  })

  test('cameraTarget centres an archipelago anchor island, and ignores an unknown one', () => {
    const home = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
    const p = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
    const model = buildSceneModel(world({ projects: [home, p] }), today)
    const island = model.islands.find((i) => i.projectId === p.id)
    expect(cameraTarget(model, { kind: 'archipelago' }, p.id)).toEqual({
      ...island?.origin,
      zoom: ARCHIPELAGO_ZOOM,
    })
    expect(cameraTarget(model, { kind: 'archipelago' }, 'gone')).toEqual(
      cameraTarget(model, { kind: 'archipelago' }),
    )
    // The anchor only matters in archipelago view.
    expect(cameraTarget(model, { kind: 'island', projectId: home.id }, p.id).zoom).toBe(ISLAND_ZOOM)
  })

  test('openingIsland: stepping out, then urgency, then last viewed, else none', () => {
    const s = (id: string, overdue: number, dueSoon: number) => ({
      project: { id },
      overdue,
      dueSoon,
    })
    const calm = [s('a', 0, 0), s('b', 0, 0)]
    const urgent = [s('a', 0, 3), s('b', 1, 0), s('c', 1, 2)]
    expect(openingIsland(urgent, 'a', 'b')).toBe('a')
    expect(openingIsland(urgent, null, 'a')).toBe('c') // overdue first, due-soon breaks the tie
    expect(openingIsland([s('a', 1, 0), s('b', 1, 0)], null, null)).toBe('a') // switcher order
    expect(openingIsland(calm, null, 'b')).toBe('b')
    expect(openingIsland(calm, null, null)).toBeNull()
  })

  test('openingIsland skips a deleted previous or last-viewed island', () => {
    const s = (id: string, overdue: number) => ({ project: { id }, overdue, dueSoon: 0 })
    expect(openingIsland([s('a', 0), s('b', 2)], 'deleted', null)).toBe('b')
    expect(openingIsland([s('a', 0)], 'deleted', 'also-deleted')).toBeNull()
    expect(openingIsland([s('a', 0)], 'deleted', 'a')).toBe('a')
  })
})

describe('decorations', () => {
  test('appear per island with position and rotation; unknown types are skipped', () => {
    const beta = fakeProject()
    const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1, rotation: 3 })
    const legacy = fakeBuilding({ projectId: beta.id, type: 'tree', plotX: 1, plotY: 1 })
    const model = buildSceneModel(world({ projects: [beta], buildings: [pine, legacy] }), today)
    expect(model.islands[0]?.decorations).toEqual([
      {
        buildingId: pine.id,
        type: 'pine',
        position: spotOf(model.islands[0], { q: 0, r: 1 }),
        rotation: 3,
      },
    ])
  })

  test('decoration plots, known or not, count toward the island radius', () => {
    const beta = fakeProject()
    const edge = fakeBuilding({ projectId: beta.id, type: 'tree', plotX: 5, plotY: -1 })
    const model = buildSceneModel(world({ projects: [beta], buildings: [edge] }), today)
    expect(model.islands[0]?.radius).toBe(7)
  })
})

describe('island growth', () => {
  const ringHexes = [1, 2, 3].flatMap((r) => hexRing({ q: 0, r: 0 }, r))

  test('the stage counts finished tasks only', () => {
    const p = fakeProject()
    const at = (i: number) => ringHexes[i] ?? { q: 0, r: 1 }
    const tasks = [
      ...[0, 1].map((i) =>
        fakeTask({ projectId: p.id, status: 'done', plotX: at(i).q, plotY: at(i).r }),
      ),
      ...[2, 3, 4].map((i) =>
        fakeTask({ projectId: p.id, status: 'doing', plotX: at(i).q, plotY: at(i).r }),
      ),
      ...[5, 6].map((i) =>
        fakeTask({ projectId: p.id, status: 'todo', plotX: at(i).q, plotY: at(i).r }),
      ),
    ]
    const stage = (ts: typeof tasks) =>
      buildSceneModel(world({ projects: [p], tasks: ts }), today).islands[0]?.stage
    expect(stage(tasks)).toBe(0)
    const third = tasks.map((t, i) => (i === 2 ? { ...t, status: 'done' as const } : t))
    expect(stage(third)).toBe(1)
  })

  test('a path leads to a district once it has a finished task; reopening removes it', () => {
    const p = fakeProject()
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const done = fakeTask({
      projectId: p.id,
      milestoneId: m.id,
      status: 'done',
      plotX: 0,
      plotY: 1,
    })
    const build = (t: typeof done) =>
      buildSceneModel(world({ projects: [p], milestones: [m], tasks: [t] }), today).islands[0]
    const island = build(done)
    expect(island?.paths).toEqual(pathHexes([{ q: 5, r: 0 }]))
    for (const h of island?.paths ?? []) {
      expect(island?.tiles.find((t) => t.q === h.q && t.r === h.r)?.tone).toBe('path')
    }
    const reopened = build({ ...done, status: 'todo', completedAt: null })
    expect(reopened?.paths).toEqual([])
    expect(reopened?.tiles.some((t) => t.tone === 'path')).toBe(false)
  })

  test('scenery never sits on a task, district or decoration plot; a dock from 8 finished tasks', () => {
    const p = fakeProject({ islandSeed: 21 })
    const m = fakeMilestone({ projectId: p.id, districtQ: 5, districtR: 0 })
    const plots = ringHexes.slice(0, 30)
    const tasks = plots.map((h, i) =>
      fakeTask({ projectId: p.id, status: i < 8 ? 'done' : 'todo', plotX: h.q, plotY: h.r }),
    )
    const pine = fakeBuilding({ projectId: p.id, type: 'pine', plotX: -4, plotY: 0 })
    const build = (ts: typeof tasks) =>
      buildSceneModel(
        world({ projects: [p], milestones: [m], tasks: ts, buildings: [pine] }),
        today,
      ).islands[0]
    const island = build(tasks)
    const banned = new Set([...plots, { q: 5, r: 0 }, { q: -4, r: 0 }].map(hexKey))
    for (const s of island?.scenery ?? []) expect(banned.has(s.id.split(':')[0] ?? '')).toBe(false)
    expect(island?.stage).toBe(2)
    expect(island?.dock).not.toBeNull()
    const seven = tasks.map((t, i) => (i === 7 ? { ...t, status: 'todo' as const } : t))
    expect(build(seven)?.dock).toBeNull()
  })
})
