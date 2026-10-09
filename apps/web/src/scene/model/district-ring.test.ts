import { type Hex, hexKey, type WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { quietEconomy } from '../../test/sea-worlds'
import {
  districtAt,
  districtHexMap,
  districtTiles,
  ringLeg,
  ringLoops,
  ringTarget,
} from './district-ring'
import { hexToWorld } from './hex-space'
import {
  buildSceneModel,
  type SceneDistrict,
  type SceneIsland,
  type SceneStructure,
} from './scene-model'

const flat = (tiles: Hex[], y = 1) => new Map(tiles.map((t) => [hexKey(t), y]))
const spot = (h: Hex, y = 1) => ({ ...hexToWorld(h), y })
const district = (h: Hex): SceneDistrict => ({
  milestoneId: 'm',
  name: 'M',
  type: 'lighthouse',
  progress: 0,
  position: spot(h),
})
const task = (h: Hex, milestoneId: string | null = 'm'): SceneStructure => ({
  taskId: hexKey(h),
  milestoneId,
  kind: 'house',
  marker: null,
  position: spot(h),
})
const keys = (hs: Hex[]) => hs.map(hexKey).sort()

describe('districtTiles', () => {
  test('the landmark plus its own tasks’ plots; other districts’ and loose tasks are left out', () => {
    const tiles = districtTiles(district({ q: 5, r: 0 }), [
      task({ q: 6, r: 0 }),
      task({ q: 4, r: 1 }),
      task({ q: 1, r: 0 }, null),
      task({ q: 9, r: 0 }, 'other'),
    ])
    expect(keys(tiles)).toEqual(
      keys([
        { q: 5, r: 0 },
        { q: 6, r: 0 },
        { q: 4, r: 1 },
      ]),
    )
  })

  test('a gap the plots enclose is filled', () => {
    const ring = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
    ]
    const tiles = districtTiles(
      district({ q: 0, r: 1 }),
      ring.map((h) => task(h)),
    )
    expect(keys(tiles)).toContain('0,0')
    expect(tiles).toHaveLength(7)
  })

  test('a district with no tasks is its landmark hex', () => {
    expect(districtTiles(district({ q: -5, r: 5 }), [])).toEqual([{ q: -5, r: 5 }])
  })
})

describe('ringLoops', () => {
  const closes = (loop: { x: number; z: number }[]) =>
    loop.every((p, i) => {
      const n = loop[(i + 1) % loop.length] as { x: number; z: number }
      return Math.hypot(p.x - n.x, p.z - n.z) <= 1 + 1e-9
    })

  test('one hex: one loop of six corners, mitres pointing at the centre', () => {
    const loops = ringLoops([{ q: 0, r: 0 }], flat([{ q: 0, r: 0 }]))
    expect(loops).toHaveLength(1)
    const loop = loops[0] ?? []
    expect(loop).toHaveLength(6)
    expect(closes(loop)).toBe(true)
    for (const p of loop) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(1)
      expect(p.y).toBe(1)
      expect(Math.hypot(p.mx, p.mz)).toBeCloseTo(1 / Math.cos(Math.PI / 6))
      expect(p.mx * -p.x + p.mz * -p.z).toBeGreaterThan(0)
    }
  })

  test('two neighbours: one loop of ten corners', () => {
    const two = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]
    const loops = ringLoops(two, flat(two))
    expect(loops.map((l) => l.length)).toEqual([10])
    expect(closes(loops[0] ?? [])).toBe(true)
  })

  test('a height step adds a straight drop at each shared corner', () => {
    const two = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]
    const loop =
      ringLoops(
        two,
        new Map([
          ['0,0', 1],
          ['1,0', 1.3],
        ]),
      )[0] ?? []
    expect(loop).toHaveLength(12)
    const drops = loop.filter((p, i) => {
      const n = loop[(i + 1) % loop.length] as typeof p
      return Math.hypot(p.x - n.x, p.z - n.z) < 1e-9 && p.y !== n.y
    })
    expect(drops).toHaveLength(2)
  })

  test('a detached plot makes a second loop', () => {
    const far = [
      { q: 0, r: 0 },
      { q: 5, r: 0 },
    ]
    expect(ringLoops(far, flat(far)).map((l) => l.length)).toEqual([6, 6])
  })
})

describe('ringTarget', () => {
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
  const world: WorldDto = {
    projects: [beta],
    milestones: [mvp],
    tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
    buildings: [],
    economy: quietEconomy,
  }
  const model = buildSceneModel(world, '2026-10-09')

  test('only on a known district', () => {
    expect(ringTarget(model, { kind: 'archipelago' })).toBeNull()
    expect(ringTarget(model, { kind: 'island', projectId: beta.id })).toBeNull()
    expect(
      ringTarget(model, { kind: 'district', projectId: beta.id, milestoneId: 'nope' }),
    ).toBeNull()
    expect(
      ringTarget(model, { kind: 'district', projectId: 'nope', milestoneId: mvp.id }),
    ).toBeNull()
  })

  test('a district: its loops at the island origin, keyed on its tiles and their heights', () => {
    const t = ringTarget(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id })
    if (!t) throw new Error('no ring')
    expect(t.district).toBe(`${beta.id}/${mvp.id}`)
    expect(t.origin).toEqual(model.islands[0]?.origin)
    // The landmark and its neighbouring plot make one piece.
    expect(t.loops).toHaveLength(1)
    expect(t.key).toBe(
      ringTarget(buildSceneModel(world, '2026-10-09'), {
        kind: 'district',
        projectId: beta.id,
        milestoneId: mvp.id,
      })?.key,
    )
  })

  test('the key follows the island origin, which moves when another island grows', () => {
    const focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id } as const
    const gamma = fakeProject({ name: 'Gamma', archipelagoX: 0, archipelagoY: 0 })
    const shifted = { ...beta, archipelagoX: 1 }
    const withGamma = (count: number) =>
      buildSceneModel(
        {
          ...world,
          projects: [shifted, gamma],
          tasks: [
            ...world.tasks,
            ...Array.from({ length: count }, (_, i) =>
              fakeTask({ projectId: gamma.id, plotX: i % 4, plotY: Math.floor(i / 4) }),
            ),
          ],
        },
        '2026-10-09',
      )
    const near = withGamma(12)
    const far = withGamma(120)
    const a = ringTarget(near, focus)
    const b = ringTarget(far, focus)
    expect(a?.origin).not.toEqual(b?.origin)
    expect(a?.key).not.toBe(b?.key)
    expect(a?.key).toBe(ringTarget(withGamma(12), focus)?.key)
  })
})

describe('ringTarget without a tile', () => {
  test('a district hex with no tile is left out of the ring and its key', () => {
    const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
    const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
    const world: WorldDto = {
      projects: [beta],
      milestones: [mvp],
      tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
      buildings: [],
      economy: quietEconomy,
    }
    const focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id } as const
    const model = buildSceneModel(world, '2026-10-09')
    const island = model.islands[0]
    if (!island) throw new Error('no island')
    const full = ringTarget(model, focus)
    expect(full?.key).toContain('6,0@')
    const bare = {
      ...model,
      islands: [{ ...island, tiles: island.tiles.filter((t) => hexKey(t) !== '6,0') }],
    }
    const t = ringTarget(bare, focus)
    expect(t?.key).not.toContain('6,0@')
    expect(t?.key).toContain('5,0@')
    expect(t?.loops).toHaveLength(1)
    expect(t?.loops[0]).toHaveLength(6)
  })
})

describe('ringTarget with a hovered district', () => {
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
  const world: WorldDto = {
    projects: [beta, gamma],
    milestones: [mvp],
    tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
    buildings: [],
    economy: quietEconomy,
  }
  const model = buildSceneModel(world, '2026-10-09')
  const focused = ringTarget(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id })

  test('on the island view the hovered district gets the same target as focusing it', () => {
    const hovered = ringTarget(model, { kind: 'island', projectId: beta.id }, mvp.id)
    expect(hovered).not.toBeNull()
    expect(hovered).toEqual(focused)
  })

  test('ignored on the archipelago, in a district, and on another island', () => {
    expect(ringTarget(model, { kind: 'archipelago' }, mvp.id)).toBeNull()
    expect(ringTarget(model, { kind: 'island', projectId: gamma.id }, mvp.id)).toBeNull()
    const inDistrict = { kind: 'district', projectId: beta.id, milestoneId: mvp.id } as const
    expect(ringTarget(model, inDistrict, 'other')).toEqual(focused)
  })

  test('an unknown or absent hovered id gives none', () => {
    expect(ringTarget(model, { kind: 'island', projectId: beta.id }, 'nope')).toBeNull()
    expect(ringTarget(model, { kind: 'island', projectId: beta.id }, null)).toBeNull()
  })
})

describe('districtAt', () => {
  const ring = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
  ]
  const base = buildSceneModel(
    {
      projects: [fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })],
      milestones: [],
      tasks: [],
      buildings: [],
      economy: quietEconomy,
    },
    '2026-10-09',
  ).islands[0] as SceneIsland
  const land = [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 5, r: 5 }, ...ring]
  const island: SceneIsland = {
    ...base,
    tiles: land.map((h) => ({ ...(base.tiles[0] as SceneIsland['tiles'][number]), ...h })),
    districts: [{ ...district({ q: 0, r: 1 }), milestoneId: 'm' }],
    structures: [...ring.map((h) => task(h)), task({ q: 5, r: 5 }, null)],
  }

  test('the landmark hex, a task plot and an enclosed gap belong to the district', () => {
    expect(districtAt(island, { q: 0, r: 1 })).toBe('m')
    expect(districtAt(island, { q: 1, r: -1 })).toBe('m')
    expect(districtAt(island, { q: 0, r: 0 })).toBe('m')
  })

  test('null for a loose plot, an untiled hex and off the island', () => {
    expect(districtAt(island, { q: 5, r: 5 })).toBeNull()
    expect(districtAt(island, { q: 2, r: 0 })).toBeNull()
    expect(districtAt(island, { q: 90, r: -40 })).toBeNull()
  })

  test('hexes without a drawn tile are clipped, as the ring clips them', () => {
    const bare = { ...island, tiles: island.tiles.filter((t) => hexKey(t) !== '1,0') }
    expect(districtAt(bare, { q: 1, r: 0 })).toBeNull()
    expect(districtHexMap(bare).has('1,0')).toBe(false)
    expect(districtHexMap(bare).get('0,1')).toBe('m')
  })
})

describe('ringLeg', () => {
  test('in on arrival, out on leaving, swap between districts, nothing when the same', () => {
    expect(ringLeg(null, 'a')).toBe('in')
    expect(ringLeg('a', null)).toBe('out')
    expect(ringLeg('a', 'b')).toBe('swap')
    expect(ringLeg('a', 'a')).toBe('none')
    expect(ringLeg(null, null)).toBe('none')
  })
})
