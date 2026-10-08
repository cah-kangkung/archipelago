import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject, fakeTask } from '../test/fake-api'
import { quietEconomy } from '../test/sea-worlds'
import type { Focus } from '../world/selectors'
import { layerArea } from './model/camera'
import { scenePalette } from './model/palette'
import { buildSceneModel, type SceneModel } from './model/scene-model'
import { hazeHex } from './model/spotlight'
import { spotlightUniforms } from './spotlight-material'
import { SpotlightRig } from './spotlight-rig'
import { SPOTLIGHT_MS } from './tuning'

const today = '2026-10-08'
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

const grab: { scene?: THREE.Scene } = {}
function Grab() {
  grab.scene = useThree((s) => s.scene)
  return null
}

type Props = {
  model: SceneModel
  focus: Focus
  animate?: boolean
  onRunning?: (r: boolean) => void
}
const tree = ({ model: m, focus, animate = true, onRunning }: Props) => (
  <>
    <color attach="background" args={[scenePalette.seaDeep]} />
    <SpotlightRig model={m} focus={focus} animate={animate} onRunning={onRunning} />
    <Grab />
  </>
)
const strength = () => spotlightUniforms.uSpotStrength.value
const box = () => spotlightUniforms.uSpotBox.value.toArray()
const background = () => `#${(grab.scene?.background as THREE.Color | undefined)?.getHexString()}`
const frames = Math.ceil(SPOTLIGHT_MS / 100) + 1

describe('SpotlightRig', () => {
  test('off on the archipelago; entering an island fades it in over SPOTLIGHT_MS', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: archipelago, onRunning }))
    expect(strength()).toBe(0)
    expect(onRunning).not.toHaveBeenCalledWith(true)
    await r.update(tree({ model, focus: onBeta, onRunning }))
    expect(onRunning).toHaveBeenLastCalledWith(true)
    // The first frame after the route change doesn't advance the fade.
    await r.advanceFrames(1, 0.1)
    expect(strength()).toBe(0)
    await r.advanceFrames(1, 0.1)
    expect(strength()).toBeGreaterThan(0)
    expect(strength()).toBeLessThan(1)
    await r.advanceFrames(frames, 0.1)
    expect(strength()).toBe(1)
    const a = layerArea(model, onBeta)
    expect(box()).toEqual([a?.minX, a?.minZ, a?.maxX, a?.maxZ])
    expect(onRunning).toHaveBeenLastCalledWith(false)
    expect(background()).toBe(hazeHex(scenePalette.seaDeep, 1))
  })

  test('island to island slides the area at full strength', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    expect(strength()).toBe(1)
    await r.update(tree({ model, focus: onGamma }))
    const start = layerArea(model, onBeta)?.minX ?? 0
    await r.advanceFrames(1, 0.1)
    expect(box()[0]).toBe(start)
    await r.advanceFrames(1, 0.1)
    expect(strength()).toBe(1)
    const from = layerArea(model, onBeta)?.minX ?? 0
    const to = layerArea(model, onGamma)?.minX ?? 0
    expect(box()[0]).toBeGreaterThan(Math.min(from, to))
    expect(box()[0]).toBeLessThan(Math.max(from, to))
  })

  test('back to the archipelago fades out; the background returns to the plain sea', async () => {
    const r = await ReactThreeTestRenderer.create(tree({ model, focus: onBeta, animate: false }))
    await r.update(tree({ model, focus: archipelago }))
    await r.advanceFrames(frames + 1, 0.1)
    expect(strength()).toBe(0)
    expect(background()).toBe(scenePalette.seaDeep)
  })

  test('reduced motion switches at once and never runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: archipelago, animate: false, onRunning }),
    )
    await r.update(tree({ model, focus: onBeta, animate: false, onRunning }))
    expect(strength()).toBe(1)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })

  test('a refetch that keeps the area neither replays the fade nor runs', async () => {
    const onRunning = vi.fn()
    const r = await ReactThreeTestRenderer.create(
      tree({ model, focus: onBeta, animate: false, onRunning }),
    )
    const refetched = buildSceneModel(
      { ...world, tasks: [fakeTask({ projectId: gamma.id, plotX: 1, plotY: 0 })] },
      today,
    )
    await r.update(tree({ model: refetched, focus: onBeta, onRunning }))
    expect(strength()).toBe(1)
    expect(onRunning).not.toHaveBeenCalledWith(true)
  })
})
