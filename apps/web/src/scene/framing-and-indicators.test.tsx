import type { WorldDto } from '@archipelago/shared'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type { ReactNode } from 'react'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeProject } from '../test/fake-api'
import { ISO_DISTANCE } from './camera-rig'
import { Framing } from './framing'
import { IndicatorProbe } from './indicator-probe'
import { createIndicatorStore } from './indicator-store'
import type { IslandUrgency } from './model/indicators'
import { buildSceneModel } from './model/scene-model'

const grab: {
  camera?: THREE.OrthographicCamera
  setSize?: (w: number, h: number) => void
  set?: (patch: { invalidate: () => void }) => void
} = {}
function Grab() {
  grab.camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  grab.setSize = useThree((s) => s.setSize)
  grab.set = useThree((s) => s.set) as typeof grab.set
  return null
}
function view() {
  const v = grab.camera?.view
  if (!v) throw new Error('no view offset set')
  return v
}

const create = (node: ReactNode, zoom = 10) =>
  ReactThreeTestRenderer.create(
    <>
      {node}
      <Grab />
    </>,
    {
      orthographic: true,
      width: 400,
      height: 800,
      camera: { position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE], zoom },
    },
  )

describe('Framing', () => {
  // jsdom's window.innerHeight is 768, so at most 384px of cover is framed.
  test('offsets the projection by half the framed cover, capped at half the window', async () => {
    const r = await create(<Framing covered={300} animate={false} />)
    await r.advanceFrames(1, 0.016)
    expect(view()).toMatchObject({ enabled: true, offsetX: 0, offsetY: 150, fullWidth: 400 })
    await r.update(
      <>
        <Framing covered={700} animate={false} />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(view().offsetY).toBe(192)
    await r.update(
      <>
        <Framing covered={0} animate={false} />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(view().enabled).toBe(false)
  })

  test('eases to a new cover over 250ms', async () => {
    const r = await create(<Framing covered={120} animate />)
    await r.advanceFrames(1, 0.016)
    expect(view().offsetY).toBe(60)
    await r.update(
      <>
        <Framing covered={300} animate />
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.1)
    expect(view().offsetY).toBeGreaterThan(60)
    expect(view().offsetY).toBeLessThan(150)
    await r.advanceFrames(3, 0.1)
    expect(view().offsetY).toBe(150)
  })

  test('re-applies the offset at the new size when the canvas resizes', async () => {
    const r = await create(<Framing covered={300} animate={false} />)
    await r.advanceFrames(1, 0.016)
    await ReactThreeTestRenderer.act(async () => grab.setSize?.(500, 900))
    await r.advanceFrames(1, 0.016)
    expect(view()).toMatchObject({ fullWidth: 500, fullHeight: 900, offsetY: 150 })
  })
})

describe('indicators', () => {
  const economy: WorldDto['economy'] = {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  }
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ name: 'Gamma', archipelagoX: 3, archipelagoY: 0 })
  const model = buildSceneModel(
    { projects: [beta, gamma], milestones: [], tasks: [], buildings: [], economy },
    '2026-10-08',
  )
  const urgentGamma: IslandUrgency = {
    projectId: gamma.id,
    name: 'Gamma',
    urgency: 'overdue',
    count: 2,
  }
  const probe = (
    store: ReturnType<typeof createIndicatorStore>,
    urgent: IslandUrgency[],
    current: string | null,
    covered = 0,
  ) => (
    <IndicatorProbe
      model={model}
      urgent={urgent}
      currentProjectId={current}
      covered={covered}
      store={store}
    />
  )

  test('the store notifies only when the markers change', () => {
    const store = createIndicatorStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    const marker = { ...urgentGamma, left: 1, top: 2, angle: 0 }
    store.set([marker])
    store.set([{ ...marker }])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get()).toEqual([marker])
    stop()
    store.set([])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('an off-screen urgent island gets a marker; the current island never does', async () => {
    // Camera on Beta at island zoom: Gamma is far off screen.
    const store = createIndicatorStore()
    const r = await create(probe(store, [urgentGamma], beta.id), 48)
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([expect.objectContaining({ projectId: gamma.id, name: 'Gamma' })])

    await r.update(
      <>
        {probe(store, [urgentGamma], gamma.id)}
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([])
  })

  test('a marker disappears when its island stops being urgent', async () => {
    const store = createIndicatorStore()
    const r = await create(probe(store, [urgentGamma], beta.id), 48)
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toHaveLength(1)
    await r.update(
      <>
        {probe(store, [], beta.id)}
        <Grab />
      </>,
    )
    await r.advanceFrames(1, 0.016)
    expect(store.get()).toEqual([])
  })

  test('re-checks the markers when only the sheet cover changes', async () => {
    const store = createIndicatorStore()
    const urgent = [urgentGamma] // stable identity: only `covered` may re-run the effect
    const r = await create(probe(store, urgent, beta.id, 450), 48)
    await r.advanceFrames(1, 0.016)
    const spy = vi.fn()
    await ReactThreeTestRenderer.act(async () => grab.set?.({ invalidate: spy }))
    // Re-rendering with nothing changed must not request a frame.
    spy.mockClear()
    await r.update(
      <>
        {probe(store, urgent, beta.id, 450)}
        <Grab />
      </>,
    )
    expect(spy).not.toHaveBeenCalled()
    await r.update(
      <>
        {probe(store, urgent, beta.id, 700)}
        <Grab />
      </>,
    )
    expect(spy).toHaveBeenCalled()
  })
})
