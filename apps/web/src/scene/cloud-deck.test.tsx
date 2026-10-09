import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { CloudDeck } from './cloud-deck'
import {
  CLOUD_DECK_RENDER_ORDER,
  cloudDeckMaterial,
  cloudDeckUniforms,
  writeDeck,
  writeDrift,
} from './cloud-deck-material'
import { DECK_OFF, deckHole } from './model/cloud-deck'
import { LAND_HEIGHT } from './model/hex-space'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import {
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_DRIFT,
  CLOUD_DECK_TILE,
  CLOUD_MS,
  FOG_DEPTH,
  FOG_MARGIN,
} from './tuning'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [],
  tasks: [],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const archipelago: Focus = { kind: 'archipelago' }
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onGamma: Focus = { kind: 'island', projectId: gamma.id }

type Props = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  drifting?: boolean
  onRunning?: (r: boolean) => void
}
const tree = ({ model: m, focus, animate = true, drifting = false, onRunning }: Props) => (
  <CloudDeck model={m} focus={focus} animate={animate} drifting={drifting} onRunning={onRunning} />
)
const opacity = () => cloudDeckUniforms.uOpacity.value
const box = () => cloudDeckUniforms.uBox.value.toArray()
const frames = Math.ceil(CLOUD_MS / 100) + 1

describe('CloudDeck', () => {
  beforeEach(() => {
    writeDeck(DECK_OFF)
    cloudDeckUniforms.uBox.value.set(0, 0, 0, 0)
    cloudDeckUniforms.uRound.value = 0
    writeDrift(0)
  })

  test('one untappable plane over the whole world, drawn above everything', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    const meshes = r.scene.findAllByType('Mesh')
    expect(meshes).toHaveLength(1)
    const mesh = meshes[0]?.instance as THREE.Mesh
    expect(mesh.material).toBe(cloudDeckMaterial)
    expect(mesh.renderOrder).toBe(CLOUD_DECK_RENDER_ORDER)
    expect(mesh.frustumCulled).toBe(false)
    const hits: THREE.Intersection[] = []
    mesh.raycast({} as THREE.Raycaster, hits)
    expect(hits).toHaveLength(0)
    mesh.geometry.computeBoundingBox()
    mesh.updateMatrixWorld()
    const size = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld)
    const b = model.bounds
    const m = FOG_MARGIN + FOG_DEPTH
    expect(size?.min.x).toBeCloseTo(b.minX - m)
    expect(size?.max.x).toBeCloseTo(b.maxX + m)
    expect(size?.min.z).toBeCloseTo(b.minZ - m)
    expect(size?.max.z).toBeCloseTo(b.maxZ + m)
    expect(size?.min.y).toBeCloseTo(LAND_HEIGHT)
    expect(size?.max.y).toBeCloseTo(LAND_HEIGHT)
  })

  test('the first mount shows its deck at once, even on a deep link', async () => {
    const onRunning = vi.fn()
    await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    const h = deckHole(model, onBeta)
    expect(box()).toEqual([h?.minX, h?.minZ, h?.maxX, h?.maxZ])
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('hidden on the archipelago; entering an island fades it in over CLOUD_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    expect(opacity()).toBe(0)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    // The first frame after the route change doesn't advance the fade.
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBe(0)
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBeGreaterThan(0)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('island to island slides the hole at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    const from = deckHole(model, onBeta)?.minX ?? 0
    const to = deckHole(model, onGamma)?.minX ?? 0
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
    await r.advanceFrames(frames, 0.1)
    expect(box()[0]).toBeCloseTo(to)
  })

  test('back to the archipelago mid-slide fades out from where the hole is', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(3, 0.1)
    const mid = box()[0]
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(2, 0.1)
    expect(box()[0]).toBe(mid)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(0)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the hole neither replays the fade nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('the mesh is hidden while the deck shows nothing', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago }))
    const mesh = r.scene.findAllByType('Mesh')[0]?.instance as THREE.Mesh
    expect(mesh.visible).toBe(false)
    await r.update(tree({ model, focus: onBeta }))
    await r.advanceFrames(2, 0.1)
    expect(mesh.visible).toBe(true)
    await r.advanceFrames(frames, 0.1)
    expect(mesh.visible).toBe(true)
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(2, 0.1)
    expect(mesh.visible).toBe(true)
    await r.advanceFrames(frames, 0.1)
    expect(mesh.visible).toBe(false)
  })

  test('a deep link to an island is visible from the first render', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    const mesh = r.scene.findAllByType('Mesh')[0]?.instance as THREE.Mesh
    expect(mesh.visible).toBe(true)
  })

  test('unmounting mid-leg releases the ticker demand', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('turning animation off mid-leg finishes the leg at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('drifts only while drifting is on, every layer offset in [0, 1)', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.advanceFrames(5, 0.1)
    expect(cloudDeckUniforms.uOffA.value.toArray()).toEqual([0, 0])
    await r.update(tree({ model, focus: onBeta, drifting: true }))
    await r.advanceFrames(5, 0.1)
    const [u] = cloudDeckUniforms.uOffA.value.toArray()
    expect(u).toBeGreaterThan(0)
    expect(u).toBeLessThanOrEqual((5 * 0.1 * CLOUD_DECK_DRIFT) / CLOUD_DECK_TILE + 1e-9)
    for (const off of [
      cloudDeckUniforms.uOffA,
      cloudDeckUniforms.uOffB,
      cloudDeckUniforms.uOffCover,
      cloudDeckUniforms.uWarpOff,
    ]) {
      for (const x of off.value.toArray()) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThan(1)
      }
    }
  })
})
