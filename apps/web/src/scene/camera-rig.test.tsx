import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject } from '../test/fake-api'
import type { Focus } from '../world/selectors'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { type Area, clampToArea } from './model/area'
import { cameraTarget, ISLAND_ZOOM, MAX_ZOOM_FACTOR, panArea } from './model/camera'
import { flyDuration, flyFrame, hopZoom } from './model/camera-motion'
import { islandExtent, shallowsRadius } from './model/hex-space'
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
const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0, islandSeed: 21 })
const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0, islandSeed: 21 })
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
const delta = fakeProject({ name: 'Delta', archipelagoX: 0, archipelagoY: 3, islandSeed: 21 })
const tall = buildSceneModel(worldOf([beta, delta]), today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onDelta: Focus = { kind: 'island', projectId: delta.id }
const canvas = { width: 400, height: 800, covered: 0, framed: 0 }

/** The box an area reaches: on an axis through its middle, the pan edge is this box's side. */
const outer = (a: Area) => {
  const r = a.round ?? 0
  return { minX: a.minX - r, maxX: a.maxX + r, minZ: a.minZ - r, maxZ: a.maxZ + r }
}

const grab: { camera?: THREE.Camera & { zoom: number }; controls?: Controls } = {}
function Grab() {
  grab.camera = useThree((s) => s.camera)
  grab.controls = (useThree((s) => s.controls) ?? undefined) as unknown as Controls | undefined
  return null
}

type RigProps = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  covered?: number
  hudInset?: number
  onMotion?: (moving: boolean) => void
}
const scene = ({ model, focus, animate = true, covered = 0, hudInset = 0, onMotion }: RigProps) => (
  <>
    <CameraRig
      model={model}
      focus={focus}
      animate={animate}
      covered={covered}
      hudInset={hudInset}
      onMotion={onMotion}
    />
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
    // The first frame only starts the clock.
    await r.advanceFrames(2, 0.1)
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
    // The grab is outside the island it was flying to, so the band takes up the overshoot once;
    // from there the camera holds still, at the same zoom.
    await r.advanceFrames(1, 0.1)
    const held = view()
    expect(held.zoom).toBeCloseTo(mid.zoom)
    await r.advanceFrames(19, 0.1)
    expectView(view(), held)
    expect(controls().minZoom).toBeLessThanOrEqual(mid.zoom)
    expect(controls().maxZoom).toBeGreaterThanOrEqual(mid.zoom)
    // Released, the camera is still outside the island it is flying to: it springs in to the edge.
    controls().dispatchEvent({ type: 'end' })
    await r.advanceFrames(20, 0.1)
    const edge = clampToArea(panArea(both, onGamma), held)
    expectView(view(), { ...edge, zoom: mid.zoom })
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
    const { maxX } = outer(panArea(both, onGamma))
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
    const push = outer(panArea(both, onGamma)).maxX + 50 - c.target.x
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
    const { maxX } = outer(panArea(both, onGamma))
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
    const { maxX } = outer(panArea(both, onGamma))
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

  test('a flight from rest ignores the idle gap in its first frame', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const start = view()
    await r.update(scene({ model: both, focus: onGamma }))
    // The ticker was idle, so the first delta is the whole gap since the last frame.
    await r.advanceFrames(1, 5)
    expectView(view(), start)
  })

  test('a long frame mid-flight (a hidden tab) moves it by at most 100ms', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const start = view()
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(1, 0.016)
    await r.advanceFrames(1, 5)
    expectView(view(), flyFrame(start, goal, 100 / flyDuration(start, goal), canvas))
  })

  test('a cover change mid-flight leaves the hop zoom alone', async () => {
    const from = cameraTarget(tall, onBeta)
    const to = cameraTarget(tall, onDelta)
    // Sanity: this hop is height-limited, so a recomputed frame would change it.
    expect(hopZoom(from, to, canvas)).not.toBeCloseTo(
      hopZoom(from, to, { ...canvas, covered: 600, framed: 384 }) ?? 0,
    )
    const fly = async (coverMidway: number) => {
      const r = await mount({ model: tall, focus: onBeta })
      await r.update(scene({ model: tall, focus: onDelta }))
      await r.advanceFrames(2, 0.1)
      await r.update(scene({ model: tall, focus: onDelta, covered: coverMidway }))
      await r.advanceFrames(2, 0.1)
      const v = view()
      await r.unmount()
      return v
    }
    const steady = await fly(0)
    const covered = await fly(600)
    expect(steady.zoom).toBeLessThan(ISLAND_ZOOM)
    expectView(covered, steady)
  })

  test('momentum that carries the camera past the edge after release springs back', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const { maxX } = outer(panArea(both, onGamma))
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX - 1 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    // Damping keeps moving the target after the finger lifts.
    for (const step of [2, 2, 2]) {
      c.target.x += step
      camera().position.x += step
      c.dispatchEvent({ type: 'change' })
    }
    expect(view().x).toBeGreaterThan(maxX)
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(maxX)
  })

  test('reports when a flight starts and when it ends', async () => {
    const onMotion = vi.fn()
    const r = await mount({ model: both, focus: archipelago, onMotion })
    expect(onMotion).not.toHaveBeenCalled()
    await r.update(scene({ model: both, focus: onGamma, onMotion }))
    expect(onMotion).toHaveBeenLastCalledWith(true)
    await r.advanceFrames(20, 0.1)
    expect(onMotion).toHaveBeenLastCalledWith(false)
    expect(onMotion).toHaveBeenCalledTimes(2)
  })

  test('on an island, a pan toward the neighbour stops at this island, not the world edge', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const island = outer(panArea(both, onGamma))
    expect(island.minX).toBeGreaterThan(both.bounds.minX)
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = island.minX - 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(island.minX)
  })

  test('a district clamps to its own box', async () => {
    const m = fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })
    const withDistrict = buildSceneModel({ ...worldOf([beta, gamma]), milestones: [m] }, today)
    const onDistrict: Focus = { kind: 'district', projectId: beta.id, milestoneId: m.id }
    const r = await mount({ model: withDistrict, focus: onDistrict })
    const box = outer(panArea(withDistrict, onDistrict))
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = box.maxX + 50 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(box.maxX)
  })

  test('the zoom-out limit is the fitted zoom, and follows a cover change at rest', async () => {
    // A big canvas, so the fit beats the floor (at 400×800 it never does).
    const big = (props: RigProps) =>
      ReactThreeTestRenderer.create(scene(props), {
        orthographic: true,
        width: 2000,
        height: 1600,
        camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom: 10 },
      })
    // The sheet starts high: little room, so the limit sits at the floor.
    const r = await big({ model: both, focus: onGamma, animate: false, covered: 1200 })
    expect(controls().minZoom).toBeCloseTo(ISLAND_ZOOM)
    expect(camera().zoom).toBeCloseTo(ISLAND_ZOOM)
    // The sheet drops: the island fits bigger, the limit rises and the camera comes in to it.
    await r.update(scene({ model: both, focus: onGamma, animate: false, covered: 0 }))
    const roomy = cameraTarget(both, onGamma, null, { width: 2000, height: 1600 })
    expect(roomy.zoom).toBeGreaterThan(ISLAND_ZOOM)
    expect(controls().minZoom).toBeCloseTo(roomy.zoom)
    expect(camera().zoom).toBeCloseTo(roomy.zoom)
  })

  test('a fit that changes mid-flight sets the zoom-out limit when the flight lands', async () => {
    const big = (props: RigProps) =>
      ReactThreeTestRenderer.create(scene(props), {
        orthographic: true,
        width: 2000,
        height: 1600,
        camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom: 10 },
      })
    const r = await big({ model: both, focus: archipelago, covered: 1200 })
    await r.update(scene({ model: both, focus: onGamma, covered: 1200 }))
    // The HUD/sheet changes while the camera is in the air: the island now fits bigger.
    await r.update(scene({ model: both, focus: onGamma, covered: 0 }))
    const roomy = cameraTarget(both, onGamma, null, { width: 2000, height: 1600 })
    expect(roomy.zoom).toBeGreaterThan(ISLAND_ZOOM)
    await r.advanceFrames(60, 0.1)
    expect(controls().minZoom).toBeCloseTo(roomy.zoom)
    expect(camera().zoom).toBeCloseTo(roomy.zoom)
  })
  test('on an island a diagonal pan stops at the coastline, inside the old shallows square', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const island = both.islands.find((i) => i.projectId === gamma.id)
    if (!island) throw new Error('no gamma')
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    c.target.x += 50
    c.target.z += 50
    camera().position.x += 50
    camera().position.z += 50
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    await r.advanceFrames(8, 0.1)
    const v = view()
    const reach = Math.hypot(v.x - island.origin.x, v.z - island.origin.z)
    expect(reach).toBeCloseTo(islandExtent(island.radius))
    // 19.1's square let the centre reach √2 × the shallows radius on a diagonal.
    expect(reach).toBeLessThan(shallowsRadius(island.radius))
  })
})
