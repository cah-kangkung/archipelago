import { hexRing } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { SCENERY_KINDS } from './models/scenery'
import { SceneryLayer } from './scenery'

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
    await r.update(<SceneryLayer islands={modelWith(8).islands} lowTier={false} animate={false} />)
    expect(versions(r)).toEqual(before)
    await r.update(<SceneryLayer islands={modelWith(15).islands} lowTier={false} animate={false} />)
    expect(versions(r)).not.toEqual(before)
  })
})
