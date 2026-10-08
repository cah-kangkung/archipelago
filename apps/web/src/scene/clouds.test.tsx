import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { CloudLayer } from './clouds'
import { stillFrames } from './model/cloud-motion'
import { cloudArea, cloudRing } from './model/clouds'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { CLOUD_MAX, CLOUD_MS } from './tuning'

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
const ringOf = (focus: Focus) => {
  const c = cloudArea(model, focus)
  return c ? cloudRing(c) : []
}

type Props = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  drifting?: boolean
  onRunning?: (running: boolean) => void
}
const tree = ({ model: m, focus, animate = true, drifting = false, onRunning }: Props) => (
  <CloudLayer model={m} focus={focus} animate={animate} drifting={drifting} onRunning={onRunning} />
)
type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
const mesh = (r: Renderer) => {
  const [node] = r.scene.findAll((n) => n.props.name === 'clouds')
  if (!node) throw new Error('no clouds mesh')
  return node.instance as THREE.InstancedMesh
}
const positionAt = (m: THREE.InstancedMesh, i: number) => {
  const matrix = new THREE.Matrix4()
  m.getMatrixAt(i, matrix)
  return new THREE.Vector3().setFromMatrixPosition(matrix)
}
const frames = Math.ceil(CLOUD_MS / 100) + 1

describe('CloudLayer', () => {
  test('one instanced mesh that ignores taps, empty on the archipelago', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    const m = mesh(r)
    expect(m.count).toBe(0)
    expect(m.instanceMatrix.count).toBe(CLOUD_MAX * 2)
    const hits: THREE.Intersection[] = []
    m.raycast(new THREE.Raycaster(), hits)
    expect(hits).toEqual([])
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('entering an island gathers its ring, holding the ticker only while it runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    const ring = ringOf(onBeta)
    expect(mesh(r).count).toBe(ring.length)
    await r.advanceFrames(frames, 0.1)
    expect(onRunning).toHaveBeenLastCalledWith(false)
    const [first] = stillFrames(ring)
    const at = positionAt(mesh(r), 0)
    expect(at.x).toBeCloseTo(first?.x ?? Number.NaN)
    expect(at.y).toBeCloseTo(first?.y ?? Number.NaN)
    expect(at.z).toBeCloseTo(first?.z ?? Number.NaN)
  })

  test('island to island: the old ring parts while the new one gathers, then only the new', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    expect(mesh(r).count).toBe(ringOf(onBeta).length + ringOf(onGamma).length)
    await r.advanceFrames(frames, 0.1)
    expect(mesh(r).count).toBe(ringOf(onGamma).length)
  })

  test('back to the archipelago the ring parts away to nothing', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames, 0.1)
    expect(mesh(r).count).toBe(0)
  })

  test('a refetch with the same cloud area neither restarts the gather nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, animate: false, onRunning }),
    )
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(onRunning).not.toHaveBeenCalledWith(true)
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
  })

  test('reduced motion swaps rings at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('turning reduced motion on mid-gather finishes at once and releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.advanceFrames(2, 0.1)
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(mesh(r).count).toBe(ringOf(onBeta).length)
  })

  test('unmounting mid-gather releases the ticker', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    await r.update(tree({ model, focus: onBeta, onRunning }))
    await r.unmount()
    expect(onRunning).toHaveBeenLastCalledWith(false)
  })

  test('at rest the puffs drift on the high tier and stay still otherwise', async () => {
    const still = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, drifting: false }),
    )
    await still.advanceFrames(frames, 0.1)
    const before = positionAt(mesh(still), 0)
    await still.advanceFrames(20, 0.5)
    expect(positionAt(mesh(still), 0).equals(before)).toBe(true)
    await still.unmount()

    const drifting = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, drifting: true }),
    )
    await drifting.advanceFrames(frames, 0.1)
    const rest = positionAt(mesh(drifting), 0)
    await drifting.advanceFrames(20, 0.5)
    expect(positionAt(mesh(drifting), 0).equals(rest)).toBe(false)
  })
})
