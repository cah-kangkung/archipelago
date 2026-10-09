import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
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
  CLOUD_ARCHIPELAGO_THRESHOLD,
  CLOUD_ARCHIPELAGO_VEIL,
  CLOUD_DECK_ALPHA,
  CLOUD_DECK_DRIFT,
  CLOUD_DECK_FEATHER,
  CLOUD_MS,
  CLOUD_THRESHOLD,
  CLOUD_VEIL,
  SEA_MARGIN,
} from './tuning'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const later = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const world: WorldDto = {
  projects: [beta, gamma],
  milestones: [mvp, later],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const archipelago: Focus = { kind: 'archipelago' }
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onLater: Focus = { kind: 'district', projectId: beta.id, milestoneId: later.id }
const islandVeil = CLOUD_DECK_ALPHA * CLOUD_VEIL
const archVeil = CLOUD_DECK_ALPHA * CLOUD_ARCHIPELAGO_VEIL

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
    const m = SEA_MARGIN
    expect(size?.min.x).toBeCloseTo(b.minX - m)
    expect(size?.max.x).toBeCloseTo(b.maxX + m)
    expect(size?.min.z).toBeCloseTo(b.minZ - m)
    expect(size?.max.z).toBeCloseTo(b.maxZ + m)
    expect(size?.min.y).toBeCloseTo(LAND_HEIGHT)
    expect(size?.max.y).toBeCloseTo(LAND_HEIGHT)
  })

  test('the archipelago shows its lighter, sparser veil; entering an island tweens to the island veil', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    const mesh = r.scene.findAllByType('Mesh')[0]?.instance as THREE.Mesh
    expect(mesh.visible).toBe(true)
    expect(opacity()).toBeCloseTo(archVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_ARCHIPELAGO_THRESHOLD)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeGreaterThan(archVeil)
    expect(opacity()).toBeLessThan(islandVeil)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_THRESHOLD)
    expect(mesh.visible).toBe(true)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('a refetch on an island neither replays the leg nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch mid-leg does not restart the leg', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    await r.advanceFrames(Math.ceil(CLOUD_MS / 100) - 1, 0.1)
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('a refetch mid-leg into a district does not restart the leg', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.advanceFrames(2, 0.1)
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onMvp, onRunning }))
    await r.advanceFrames(Math.ceil(CLOUD_MS / 100) - 1, 0.1)
    expect(opacity()).toBeCloseTo(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('district to archipelago closes the hole to the archipelago veil', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(opacity()).toBeCloseTo(archVeil)
    expect(cloudDeckUniforms.uThreshold.value).toBe(CLOUD_ARCHIPELAGO_THRESHOLD)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
  })

  test('a fresh mount on the archipelago shows the whole veil even after a district was mounted', async () => {
    const d = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    await d.unmount()
    await ReactThreeTestRenderer.create(tree({ model, focus: archipelago }))
    const [minX, minZ, maxX, maxZ] = box()
    expect(minX).toBe(maxX)
    expect(minZ).toBe(maxZ)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
  })

  test('the first mount in a district shows its hole at once', async () => {
    const onRunning = vi.fn()
    await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    const h = deckHole(model, onMvp)
    expect(box()).toEqual([h?.minX, h?.minZ, h?.maxX, h?.maxZ])
    expect(cloudDeckUniforms.uRound.value).toBe(h?.round)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('island to district opens the hole from its centre over CLOUD_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    const h = deckHole(model, onMvp)
    if (!h) throw new Error('no district hole')
    // The first frame after the route change doesn't advance the leg: the hole is still closed.
    await r.advanceFrames(1, 0.1)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(box()[0]).toBeCloseTo((h.minX + h.maxX) / 2)
    await r.advanceFrames(1, 0.1)
    expect(opacity()).toBeGreaterThan(islandVeil)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()).toEqual([h.minX, h.minZ, h.maxX, h.maxZ])
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('district to island closes the hole in place and thins to the veil', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    const h = deckHole(model, onMvp)
    if (!h) throw new Error('no district hole')
    await r.update(tree({ model, focus: onBeta }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(opacity()).toBeCloseTo(islandVeil)
    expect(cloudDeckUniforms.uRound.value).toBe(-CLOUD_DECK_FEATHER)
    expect(box()[0]).toBeCloseTo((h.minX + h.maxX) / 2)
  })

  test('district to district slides the hole at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp }))
    await r.update(tree({ model, focus: onLater }))
    await r.advanceFrames(2, 0.1)
    const from = deckHole(model, onMvp)?.minX ?? 0
    const to = deckHole(model, onLater)?.minX ?? 0
    expect(from).not.toBe(to)
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
    await r.advanceFrames(frames, 0.1)
    expect(box()[0]).toBeCloseTo(to)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onMvp, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the hole neither replays the leg nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const refetched = buildSceneModel(
      { ...world, tasks: [...world.tasks, fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onMvp, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('unmounting mid-leg releases the ticker demand', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('turning animation off mid-leg finishes the leg at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(CLOUD_DECK_ALPHA)
    await r.update(tree({ model, focus: onMvp, animate: false, onRunning }))
    expect(opacity()).toBe(CLOUD_DECK_ALPHA)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('a fresh mount resets the drift left by an earlier one', async () => {
    cloudDeckUniforms.uDrift.value.set(40, 40)
    await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([0, 0])
  })

  test('drifts only while drifting is on', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    await r.advanceFrames(5, 0.1)
    expect(cloudDeckUniforms.uDrift.value.toArray()).toEqual([0, 0])
    await r.update(tree({ model, focus: onBeta, drifting: true }))
    await r.advanceFrames(5, 0.1)
    const [x, z] = cloudDeckUniforms.uDrift.value.toArray()
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThanOrEqual(5 * 0.1 * CLOUD_DECK_DRIFT + 1e-9)
    expect(z).toBe(x)
  })
})
