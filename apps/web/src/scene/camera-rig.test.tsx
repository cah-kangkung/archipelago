import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject } from '../test/fake-api'
import type { Focus } from '../world/selectors'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { cameraTarget, ISLAND_ZOOM, MAX_ZOOM_FACTOR } from './model/camera'
import { flyDuration } from './model/camera-motion'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import type { View } from './model/screen'

type Controls = {
  target: THREE.Vector3
  minZoom: number
  maxZoom: number
  dispose: () => void
  dispatchEvent: (event: { type: string }) => void
}

const today = '2026-10-08'
const economy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0 })
const worldOf = (projects: WorldDto['projects']): WorldDto => ({
  projects,
  milestones: [],
  tasks: [],
  buildings: [],
  economy,
})
const both = buildSceneModel(worldOf([beta, gamma]), today)
const archipelago: Focus = { kind: 'archipelago' }
const onGamma: Focus = { kind: 'island', projectId: gamma.id }

const grab: { camera?: THREE.Camera & { zoom: number }; controls?: Controls } = {}
function Grab() {
  grab.camera = useThree((s) => s.camera)
  grab.controls = (useThree((s) => s.controls) ?? undefined) as unknown as Controls | undefined
  return null
}

type RigProps = { model: SceneModel; focus: Focus; animate?: boolean }
const scene = ({ model, focus, animate = true }: RigProps) => (
  <>
    <CameraRig model={model} focus={focus} animate={animate} />
    <Grab />
  </>
)

const mount = (props: RigProps) =>
  ReactThreeTestRenderer.create(scene(props), {
    orthographic: true,
    width: 400,
    height: 800,
    camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom: 10 },
  })

function camera() {
  if (!grab.camera) throw new Error('no camera')
  return grab.camera
}
function controls() {
  if (!grab.controls) throw new Error('no controls')
  return grab.controls
}
const view = (): View => ({
  x: camera().position.x - ISO_DISTANCE,
  z: camera().position.z - ISO_DISTANCE,
  zoom: camera().zoom,
})
function expectView(actual: View, expected: View) {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.z).toBeCloseTo(expected.z)
  expect(actual.zoom).toBeCloseTo(expected.zoom)
}

describe('CameraRig', () => {
  test('the first framing after mount snaps to the target and sets the zoom limits', async () => {
    await mount({ model: both, focus: onGamma })
    expectView(view(), cameraTarget(both, onGamma))
    expect(controls().minZoom).toBe(ISLAND_ZOOM)
    expect(controls().maxZoom).toBe(ISLAND_ZOOM * MAX_ZOOM_FACTOR)
  })

  test('a route change flies: partway mid-flight, on target once the duration has passed', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const start = view()
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(1, 0.1)
    const mid = view()
    expect(Math.abs(mid.x - start.x)).toBeGreaterThan(0.01)
    expect(Math.abs(mid.x - goal.x)).toBeGreaterThan(0.01)
    await r.advanceFrames(Math.ceil(flyDuration(start, goal) / 100), 0.1)
    expectView(view(), goal)
    expect(controls().minZoom).toBe(ISLAND_ZOOM)
  })

  test('a controls start mid-flight leaves the camera where it is, inside its zoom limits', async () => {
    const r = await mount({ model: both, focus: archipelago })
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(3, 0.1)
    const mid = view()
    controls().dispatchEvent({ type: 'start' })
    await r.advanceFrames(20, 0.1)
    expectView(view(), mid)
    expect(controls().minZoom).toBeLessThanOrEqual(mid.zoom)
    expect(controls().maxZoom).toBeGreaterThanOrEqual(mid.zoom)
    controls().dispatchEvent({ type: 'end' })
    await r.advanceFrames(20, 0.1)
    expectView(view(), mid)
  })

  test('reduced motion snaps on a route change', async () => {
    const r = await mount({ model: both, focus: archipelago, animate: false })
    await r.update(scene({ model: both, focus: onGamma, animate: false }))
    expectView(view(), cameraTarget(both, onGamma))
  })

  test('a refetch mid-flight neither restarts nor redirects the flight', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(2, 0.1)
    const before = Math.abs(goal.x - view().x)
    await r.update(scene({ model: buildSceneModel(worldOf([beta, gamma]), today), focus: onGamma }))
    await r.advanceFrames(1, 0.1)
    expect(Math.abs(goal.x - view().x)).toBeLessThan(before)
    await r.advanceFrames(20, 0.1)
    expectView(view(), goal)
  })

  test('a re-render never tears the controls down', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const dispose = vi.spyOn(controls(), 'dispose')
    await r.update(scene({ model: buildSceneModel(worldOf([beta, gamma]), today), focus: onGamma }))
    await r.update(scene({ model: both, focus: onGamma }))
    expect(dispose).not.toHaveBeenCalled()
  })

  test('a drag past the edge stretches with resistance, then springs back on release', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const { maxX } = both.bounds
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    const stretched = view().x
    expect(stretched).toBeGreaterThan(maxX)
    expect(stretched).toBeLessThan(maxX + 400 / 4 / ISLAND_ZOOM)

    c.dispatchEvent({ type: 'end' })
    // Frame 1 notices the overshoot and starts the spring; frame 2 is 100ms into it.
    await r.advanceFrames(2, 0.1)
    expect(view().x).toBeLessThan(stretched)
    expect(view().x).toBeGreaterThan(maxX)
    await r.advanceFrames(5, 0.1)
    expect(view().x).toBeCloseTo(maxX)
  })

  test('grabbing a spring-back mid-way leaves the camera where it is', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = both.bounds.maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(2, 0.1)
    const mid = view().x
    c.dispatchEvent({ type: 'start' })
    c.dispatchEvent({ type: 'change' })
    expect(view().x).toBeCloseTo(mid)
  })

  test('a refetch that shrinks the world springs a resting camera back inside', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const before = view()
    const small = buildSceneModel(worldOf([beta]), today)
    expect(before.x).toBeGreaterThan(small.bounds.maxX)
    await r.update(scene({ model: small, focus: archipelago }))
    await r.advanceFrames(6, 0.1)
    expectView(view(), {
      x: small.bounds.maxX,
      z: Math.min(small.bounds.maxZ, Math.max(small.bounds.minZ, before.z)),
      zoom: before.zoom,
    })
  })

  test('a spring that lands on the edge settles: float drift past it starts no new spring', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const { maxX } = both.bounds
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(maxX)
    // controls.update() rebuilds the camera from a spherical round trip, drifting it by ~1e-13.
    camera().position.x = maxX + ISO_DISTANCE + 1e-13
    const place = vi.spyOn(camera().position, 'set')
    await r.advanceFrames(6, 0.1)
    expect(place).not.toHaveBeenCalled()
    place.mockRestore()
  })

  test('reduced motion: a release past the edge snaps straight to the edge', async () => {
    const r = await mount({ model: both, focus: onGamma, animate: false })
    const { maxX } = both.bounds
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    expect(view().x).toBeGreaterThan(maxX)
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(1, 0.016)
    expect(view().x).toBeCloseTo(maxX)
  })
})
