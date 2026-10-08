import { hexRing } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { SCENERY_KINDS } from './models/scenery'
import { SceneryLayer } from './scenery'
import { GROW_IN_MS } from './tuning'

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

const plots = [1, 2, 3].flatMap((r) => hexRing({ q: 0, r: 0 }, r))

/** Two islands with `done` finished tasks each, ids p0 and p1. */
function modelWith(done: number): SceneModel {
  const projects = [0, 1].map((i) =>
    fakeProject({ id: `p${i}`, islandSeed: 40 + i, archipelagoX: i, archipelagoY: 0 }),
  )
  const tasks = projects.flatMap((p) =>
    plots
      .slice(0, done)
      .map((h) => fakeTask({ projectId: p.id, status: 'done', plotX: h.q, plotY: h.r })),
  )
  return buildSceneModel(
    { projects, milestones: [], tasks, buildings: [], economy: quietEconomy },
    '2026-10-08',
  )
}

const meshes = (r: Renderer) => r.scene.findAll((n) => String(n.props.name).startsWith('scenery:'))
const countOf = (r: Renderer, kind: string) =>
  meshes(r)
    .filter((n) => n.props.name === `scenery:${kind}`)
    .reduce((sum, n) => sum + (n.instance as THREE.InstancedMesh).count, 0)
const versions = (r: Renderer) =>
  meshes(r).map((n) => (n.instance as THREE.InstancedMesh).instanceMatrix.version)
const make = (model: SceneModel, lowTier = false) =>
  ReactThreeTestRenderer.create(
    <SceneryLayer islands={model.islands} lowTier={lowTier} animate={false} />,
  )

describe('SceneryLayer', () => {
  test('one instanced mesh per kind for the whole archipelago, sized to the pieces', async () => {
    const model = modelWith(15)
    const r = await make(model)
    for (const kind of SCENERY_KINDS) {
      expect(
        meshes(r).filter((n) => n.props.name === `scenery:${kind}`).length,
      ).toBeLessThanOrEqual(1)
      const expected =
        kind === 'dock'
          ? model.islands.filter((i) => i.dock).length
          : model.islands.flatMap((i) => i.scenery).filter((p) => p.type === kind).length
      expect(countOf(r, kind)).toBe(expected)
    }
    expect(countOf(r, 'dock')).toBe(2)
  })

  test('instances stand at their island origin plus their local spot, turned and scaled', async () => {
    const model = modelWith(8)
    const r = await make(model)
    const island = model.islands[1]
    const piece = island?.scenery[0]
    if (!island || !piece) throw new Error('no scenery on p1')
    const same = model.islands.flatMap((i) => i.scenery.filter((p) => p.type === piece.type))
    const index = same.indexOf(piece)
    const m = new THREE.Matrix4()
    const mesh = meshes(r).find((n) => n.props.name === `scenery:${piece.type}`)
    if (!mesh) throw new Error('no mesh')
    ;(mesh.instance as THREE.InstancedMesh).getMatrixAt(index, m)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    m.decompose(position, quaternion, scale)
    expect(position.x).toBeCloseTo(island.origin.x + piece.position.x)
    expect(position.y).toBeCloseTo(piece.position.y)
    expect(position.z).toBeCloseTo(island.origin.z + piece.position.z)
    expect(scale.x).toBeCloseTo(piece.scale)
  })

  test('the low tier draws only the pieces kept on low; docks stay', async () => {
    const model = modelWith(15)
    const r = await make(model, true)
    for (const kind of SCENERY_KINDS.filter((k) => k !== 'dock')) {
      const kept = model.islands.flatMap((i) => i.scenery).filter((p) => p.type === kind && p.low)
      expect(countOf(r, kind)).toBe(kept.length)
    }
    expect(countOf(r, 'dock')).toBe(2)
  })

  test('scenery takes no taps: no handlers, and a ray straight down at a piece hits nothing', async () => {
    const model = modelWith(15)
    const r = await make(model)
    for (const n of meshes(r)) expect(n.props.onClick).toBeUndefined()
    const island = model.islands[0]
    const piece = island?.scenery[0]
    if (!island || !piece) throw new Error('no scenery')
    const ray = new THREE.Raycaster(
      new THREE.Vector3(island.origin.x + piece.position.x, 10, island.origin.z + piece.position.z),
      new THREE.Vector3(0, -1, 0),
    )
    for (const n of meshes(r)) {
      const hits: THREE.Intersection[] = []
      ;(n.instance as THREE.InstancedMesh).raycast(ray, hits)
      expect(hits).toEqual([])
    }
  })

  test('a refetch with the same content leaves the matrices alone; a new stage rewrites them', async () => {
    const r = await make(modelWith(8))
    const before = versions(r)
    const instances = meshes(r).map((n) => n.instance)
    await r.update(<SceneryLayer islands={modelWith(8).islands} lowTier={false} animate={false} />)
    expect(versions(r)).toEqual(before)
    // A remount would also land on version 1, so the very same objects must survive.
    const after = meshes(r).map((n) => n.instance)
    expect(after).toHaveLength(instances.length)
    for (const [i, instance] of after.entries()) expect(instance).toBe(instances[i])
    await r.update(<SceneryLayer islands={modelWith(15).islands} lowTier={false} animate={false} />)
    expect(versions(r)).not.toEqual(before)
  })
})

describe('SceneryLayer grow-in', () => {
  /** The smallest instance scale across every scenery mesh, relative to its piece's own scale. */
  function smallest(r: Renderer): number {
    let min = Number.POSITIVE_INFINITY
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    for (const n of meshes(r)) {
      const mesh = n.instance as THREE.InstancedMesh
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m)
        min = Math.min(min, s.setFromMatrixScale(m).x)
      }
    }
    return min
  }
  const layer = (model: SceneModel, animate: boolean, onGrowth = vi.fn(), lowTier = false) => (
    <SceneryLayer islands={model.islands} lowTier={lowTier} animate={animate} onGrowth={onGrowth} />
  )
  /** Every non-dock piece; with few tasks finished the plots leave few free inland hexes. */
  const pieces = (r: Renderer) =>
    SCENERY_KINDS.filter((k) => k !== 'dock').reduce((sum, k) => sum + countOf(r, k), 0)
  /** Instance scale per piece id (`project:q,r:k`), non-dock kinds, in the layer's draw order. */
  function scaleById(r: Renderer, model: SceneModel): Map<string, number> {
    const out = new Map<string, number>()
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    for (const kind of SCENERY_KINDS.filter((k) => k !== 'dock')) {
      const mesh = meshes(r).find((n) => n.props.name === `scenery:${kind}`)?.instance as
        | THREE.InstancedMesh
        | undefined
      const ids = model.islands.flatMap((i) =>
        i.scenery.filter((p) => p.type === kind).map((p) => `${i.projectId}:${p.id}`),
      )
      ids.forEach((id, i) => {
        mesh?.getMatrixAt(i, m)
        out.set(id, s.setFromMatrixScale(m).x)
      })
    }
    return out
  }
  const FULL = 0.79 // just under the smallest piece scale (0.8)
  const frames = Math.ceil(GROW_IN_MS / 100) + 2

  test('the first mount appears at full size and never asks for frames', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('a stage rise grows the new pieces in from nothing, then settles and releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    expect(onGrowth).toHaveBeenLastCalledWith(true)
    expect(smallest(r)).toBeLessThan(0.01)
    // Only the newly revealed pieces grow; what was already standing is not regrown.
    const small = modelWith(8)
    const old = new Set(
      small.islands.flatMap((i) => i.scenery.map((p) => `${i.projectId}:${p.id}`)),
    )
    const scales = scaleById(r, modelWith(15))
    const kept = [...scales].filter(([id]) => old.has(id))
    const added = [...scales].filter(([id]) => !old.has(id))
    expect(kept.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
    for (const [, scale] of kept) expect(scale).toBeGreaterThan(FULL)
    for (const [, scale] of added) expect(scale).toBeLessThan(0.01)
    await r.advanceFrames(1, 0.1) // the first frame only starts the clock
    await r.advanceFrames(2, 0.1)
    const mid = smallest(r)
    expect(mid).toBeGreaterThan(0.01)
    expect(mid).toBeLessThan(FULL)
    await r.advanceFrames(frames, 0.1)
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).toHaveBeenLastCalledWith(false)
  })

  test('without animation a stage rise just shows the new pieces', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), false, onGrowth))
    await r.update(layer(modelWith(15), false, onGrowth))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('a stage drop removes pieces with no grow-in', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(36), true, onGrowth))
    const before = pieces(r)
    await r.update(layer(modelWith(8), true, onGrowth))
    const after = pieces(r)
    expect(after).toBeLessThan(before)
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).not.toHaveBeenCalled()
  })

  test('losing animation mid grow-in snaps everything to full size and releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    await r.advanceFrames(2, 0.1)
    expect(smallest(r)).toBeLessThan(FULL)
    await r.update(layer(modelWith(15), false, onGrowth, true))
    expect(smallest(r)).toBeGreaterThan(FULL)
    expect(onGrowth).toHaveBeenLastCalledWith(false)
    await r.advanceFrames(3, 0.1)
    expect(smallest(r)).toBeGreaterThan(FULL)
  })

  test('unmounting mid grow-in releases the ticker', async () => {
    const onGrowth = vi.fn()
    const r = await ReactThreeTestRenderer.create(layer(modelWith(8), true, onGrowth))
    await r.update(layer(modelWith(15), true, onGrowth))
    await r.unmount()
    expect(onGrowth).toHaveBeenLastCalledWith(false)
  })
})

describe('SceneryLayer hidden plot', () => {
  const hexOf = (id: string) => id.split(':')[0] ?? ''
  const total = (r: Renderer) => SCENERY_KINDS.reduce((sum, k) => sum + countOf(r, k), 0)

  test('hides the pieces on that plot only, and clearing it brings them back without a grow-in', async () => {
    const model = modelWith(15)
    const island = model.islands[0]
    const piece = island?.scenery[0]
    if (!island || !piece) throw new Error('no scenery')
    const key = hexOf(piece.id)
    const gone = island.scenery.filter((p) => hexOf(p.id) === key).length
    expect(gone).toBeGreaterThan(0)
    const onGrowth = vi.fn()
    const layer = (hidden: { projectId: string; hex: { q: number; r: number } } | null) => (
      <SceneryLayer
        islands={model.islands}
        lowTier={false}
        animate={true}
        onGrowth={onGrowth}
        hidden={hidden}
      />
    )
    const [q = 0, rr = 0] = key.split(',').map(Number)
    const r = await ReactThreeTestRenderer.create(layer(null))
    const all = total(r)
    await r.update(layer({ projectId: island.projectId, hex: { q, r: rr } }))
    expect(total(r)).toBe(all - gone)
    await r.update(layer(null))
    expect(total(r)).toBe(all)
    expect(onGrowth).not.toHaveBeenCalled()
  })
})
