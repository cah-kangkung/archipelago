import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { DistrictRing } from './district-ring'
import {
  DISTRICT_RING_RENDER_ORDER,
  districtRingMaterial,
  districtRingUniforms,
} from './district-ring-material'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { DISTRICT_RING_FADE_MS } from './tuning'

const today = '2026-10-09'
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const mvp = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
const later = fakeMilestone({ projectId: beta.id, districtQ: -5, districtR: 5 })
const world: WorldDto = {
  projects: [beta],
  milestones: [mvp, later],
  tasks: [fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 6, plotY: 0 })],
  buildings: [],
  economy: quietEconomy,
}
const model = buildSceneModel(world, today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onMvp: Focus = { kind: 'district', projectId: beta.id, milestoneId: mvp.id }
const onLater: Focus = { kind: 'district', projectId: beta.id, milestoneId: later.id }
const frames = Math.ceil(DISTRICT_RING_FADE_MS / 100) + 1

type Props = {
  model: SceneModel
  focus: Focus
  hovered?: string | null
  animate?: boolean
  onRunning?: (r: boolean) => void
}
const tree = ({ model: m, focus, hovered = null, animate = true, onRunning }: Props) => (
  <DistrictRing model={m} focus={focus} hovered={hovered} animate={animate} onRunning={onRunning} />
)
const meshes = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAllByType('Mesh').map((m) => m.instance as THREE.Mesh)
const opacity = () => districtRingUniforms.uOpacity.value

describe('DistrictRing', () => {
  beforeEach(() => {
    districtRingUniforms.uOpacity.value = 1
  })

  test('nothing on an island; one untappable ribbon on a district, above the clouds', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta }))
    expect(meshes(r)).toHaveLength(0)
    await r.update(tree({ model, focus: onMvp, animate: false }))
    const [mesh] = meshes(r)
    if (!mesh) throw new Error('no ring')
    expect(mesh.material).toBe(districtRingMaterial)
    expect(mesh.renderOrder).toBe(DISTRICT_RING_RENDER_ORDER)
    const hits: THREE.Intersection[] = []
    mesh.raycast({} as THREE.Raycaster, hits)
    expect(hits).toHaveLength(0)
    const origin = model.islands[0]?.origin
    expect(mesh.position.x).toBe(origin?.x)
    expect(mesh.position.z).toBe(origin?.z)
  })

  test('the first mount on a district shows it at once', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    expect(meshes(r)).toHaveLength(1)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('the first mount on a hovered district shows it at once too', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, hovered: mvp.id, onRunning }),
    )
    expect(meshes(r)).toHaveLength(1)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('hovering a district fades the ring in over the fade time, holding the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onBeta, hovered: mvp.id, onRunning }))
    expect(meshes(r)).toHaveLength(1)
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(opacity()).toBe(0)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeGreaterThan(0)
    expect(opacity()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(1)
    expect(meshes(r)).toHaveLength(1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('moving off fades it out, then removes it and releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, hovered: mvp.id, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, hovered: null, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(meshes(r)).toHaveLength(1)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(1)
    expect(opacity()).toBeGreaterThan(0)
    await r.advanceFrames(frames, 0.1)
    expect(meshes(r)).toHaveLength(0)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('tapping a hovered district keeps the same ring: no leg, opacity stays 1', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onBeta, hovered: mvp.id, onRunning }))
    await r.advanceFrames(frames, 0.1)
    onRunning.mockClear()
    const mesh = meshes(r)[0]
    await r.update(tree({ model, focus: onMvp, hovered: mvp.id, onRunning }))
    await r.update(tree({ model, focus: onMvp, hovered: null, onRunning }))
    await r.advanceFrames(frames, 0.1)
    expect(meshes(r)).toHaveLength(1)
    expect(meshes(r)[0]).toBe(mesh)
    expect(meshes(r)[0]?.geometry).toBe(mesh?.geometry)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('entering a district with no hover (picker, URL) fades the ring in', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(opacity()).toBe(0)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeGreaterThan(0)
    expect(opacity()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('leaving a district fades it out, then removes it and releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    expect(meshes(r)).toHaveLength(1)
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(meshes(r)).toHaveLength(0)
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('hovering back mid fade-out fades in again from where it is', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, hovered: mvp.id, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    const partial = opacity()
    expect(partial).toBeLessThan(1)
    await r.update(tree({ model, focus: onBeta, hovered: mvp.id, onRunning }))
    expect(opacity()).toBeCloseTo(partial)
    await r.advanceFrames(frames, 0.1)
    expect(opacity()).toBe(1)
    expect(meshes(r)).toHaveLength(1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(onRunning.mock.calls.filter(([v]) => v === true)).toHaveLength(1)
  })

  test('district to district swaps at once, hovered or focused', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const before = meshes(r)[0]?.geometry
    await r.update(tree({ model, focus: onLater, onRunning }))
    expect(meshes(r)[0]?.geometry).not.toBe(before)
    expect(opacity()).toBe(1)
    const h = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, hovered: mvp.id, onRunning }),
    )
    const first = meshes(h)[0]?.geometry
    await h.update(tree({ model, focus: onBeta, hovered: later.id, onRunning }))
    expect(meshes(h)[0]?.geometry).not.toBe(first)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('a refetch with the same tiles does nothing; new tiles rebuild without animating', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onMvp, onRunning }))
    const before = meshes(r)[0]?.geometry
    await r.update(tree({ model: buildSceneModel(world, today), focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.geometry).toBe(before)
    const grown = buildSceneModel(
      {
        ...world,
        tasks: [
          ...world.tasks,
          fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 5, plotY: 1 }),
        ],
      },
      today,
    )
    await r.update(tree({ model: grown, focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.geometry).not.toBe(before)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('another island growing moves the origin: the ring follows without a leg', async () => {
    const onRunning = vi.fn()
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
        today,
      )
    const near = withGamma(12)
    const far = withGamma(120)
    const from = near.islands.find((i) => i.projectId === beta.id)?.origin
    const to = far.islands.find((i) => i.projectId === beta.id)?.origin
    expect(to).not.toEqual(from)
    const r = await ReactThreeTestRenderer.create(tree({ model: near, focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.position.x).toBe(from?.x)
    await r.update(tree({ model: far, focus: onMvp, onRunning }))
    expect(meshes(r)[0]?.position.x).toBe(to?.x)
    expect(meshes(r)[0]?.position.z).toBe(to?.z)
    expect(opacity()).toBe(1)
    expect(onRunning).not.toHaveBeenCalled()
  })

  test('without animation it appears and disappears at once', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: onBeta, hovered: mvp.id, animate: false }))
    expect(meshes(r)).toHaveLength(1)
    expect(opacity()).toBe(1)
    await r.update(tree({ model, focus: onBeta, animate: false }))
    expect(meshes(r)).toHaveLength(0)
  })

  test('unmounting mid fade-in releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, onRunning }))
    await r.update(tree({ model, focus: onMvp, onRunning }))
    await r.advanceFrames(2, 0.1)
    expect(opacity()).toBeLessThan(1)
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(opacity()).toBe(1)
  })
})
