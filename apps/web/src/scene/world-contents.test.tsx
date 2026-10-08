import { decorationRotation, type WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import type { RewardEvent } from '../rewards/reward-store'
import { fakeBuilding, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { addDays, type Focus } from '../world/selectors'
import { ghostMaterial, solidMaterial } from './materials'
import { hexToWorld, LAND_HEIGHT } from './model/hex-space'
import { buildSceneModel } from './model/scene-model'
import { ModelInstances } from './model-instances'
import { WorldContents, type WorldContentsProps } from './world-contents'

vi.mock('@react-three/drei', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/drei')>()),
  Html: () => null,
}))

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
type Node = Renderer['scene']

const today = '2026-10-07'
const economy: WorldDto['economy'] = {
  balance: 0,
  streak: { days: 0, activeToday: false, next: null },
  daily: { amount: 15, claimedToday: false },
}

function seeded() {
  const beta = fakeProject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ name: 'Gamma', archipelagoX: 1, archipelagoY: 0 })
  const mvp = fakeMilestone({
    projectId: beta.id,
    name: 'MVP',
    landmarkType: 'lighthouse',
    districtQ: 5,
    districtR: 0,
  })
  const tasks = [
    fakeTask({
      projectId: beta.id,
      title: 'Late',
      status: 'todo',
      dueDate: addDays(today, -1),
      plotX: 1,
      plotY: 0,
    }),
    fakeTask({
      projectId: beta.id,
      title: 'Soon',
      status: 'doing',
      dueDate: today,
      plotX: 2,
      plotY: 0,
    }),
    fakeTask({
      projectId: beta.id,
      milestoneId: mvp.id,
      title: 'Shipped',
      status: 'done',
      size: 'S',
      plotX: 4,
      plotY: 0,
    }),
    fakeTask({
      projectId: beta.id,
      milestoneId: mvp.id,
      title: 'Next',
      status: 'todo',
      plotX: 6,
      plotY: 0,
    }),
    fakeTask({
      projectId: gamma.id,
      title: 'Other',
      status: 'done',
      size: 'L',
      plotX: 1,
      plotY: 0,
    }),
  ]
  const world: WorldDto = {
    projects: [beta, gamma],
    milestones: [mvp],
    tasks,
    buildings: [],
    economy,
  }
  return { world, beta, gamma, mvp, tasks }
}

const handlers = () => ({
  onSelect: vi.fn(),
  onSelectBuilding: vi.fn(),
  onPickPlot: vi.fn(),
  onOpenIsland: vi.fn(),
  onOpenDistrict: vi.fn(),
})

async function render(
  world: WorldDto,
  focus: Focus,
  selectedTaskId: string | null = null,
  extra: Partial<
    Pick<WorldContentsProps, 'selectedBuildingId' | 'placement' | 'rewards' | 'animate'>
  > = {},
) {
  const h = handlers()
  const renderer = await ReactThreeTestRenderer.create(
    <WorldContents
      model={buildSceneModel(world, today)}
      focus={focus}
      selectedTaskId={selectedTaskId}
      selectedBuildingId={extra.selectedBuildingId ?? null}
      placement={extra.placement ?? null}
      rewards={extra.rewards ?? []}
      animate={extra.animate ?? false}
      {...h}
    />,
  )
  return { renderer, ...h }
}

const named = (root: Node, name: string) => root.findAll((n) => n.props.name === name)
const one = (root: Node, name: string) => {
  const [node] = named(root, name)
  if (!node) throw new Error(`no node named ${name}`)
  return node
}
const instanceCount = (root: Node, name: string) =>
  named(root, name).reduce((sum, n) => sum + (n.instance as THREE.InstancedMesh).count, 0)

describe('WorldContents', () => {
  test('renders one instance per structure and marker, per kind', async () => {
    const { world, beta } = seeded()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(instanceCount(island, 'scaffold')).toBe(2)
    expect(instanceCount(island, 'crane')).toBe(1)
    expect(instanceCount(island, 'jib')).toBe(1)
    expect(instanceCount(island, 'hut')).toBe(1)
    expect(named(island, 'workshop')).toHaveLength(0)
    expect(instanceCount(island, 'storm')).toBe(1)
    expect(instanceCount(island, 'lantern')).toBe(1)
    expect(instanceCount(island, 'shadow')).toBe(4)
    expect(named(renderer.scene, 'sea')).toHaveLength(1)
  })

  test('a structure tap in the focused island selects its task; a drag does not', async () => {
    const { world, beta, tasks } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    const scaffolds = one(one(renderer.scene, `island:${beta.id}`), 'scaffold')
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 1, delta: 20 })
    expect(onSelect).not.toHaveBeenCalled()
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 1, delta: 2 })
    expect(onSelect).toHaveBeenCalledWith(tasks[3]?.id)
  })

  test('in district view only that district’s structures select; others clear', async () => {
    const { world, beta, mvp, tasks } = seeded()
    const { renderer, onSelect } = await render(world, {
      kind: 'district',
      projectId: beta.id,
      milestoneId: mvp.id,
    })
    const scaffolds = one(one(renderer.scene, `island:${beta.id}`), 'scaffold')
    // Scaffold 0 is the commons task 'Late'; scaffold 1 is the MVP task 'Next'.
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 0, delta: 0 })
    await renderer.fireEvent(scaffolds, 'click', { instanceId: 1, delta: 0 })
    expect(onSelect.mock.calls).toEqual([[null], [tasks[3]?.id]])
  })

  test('marker and crane-jib taps select the structure that carries them', async () => {
    const { world, beta, tasks } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    await renderer.fireEvent(one(island, 'storm'), 'click', { instanceId: 0, delta: 0 })
    await renderer.fireEvent(one(island, 'lantern'), 'click', { instanceId: 0, delta: 0 })
    await renderer.fireEvent(one(island, 'jib'), 'click', { instanceId: 0, delta: 0 })
    expect(onSelect.mock.calls).toEqual([[tasks[0]?.id], [tasks[1]?.id], [tasks[1]?.id]])
  })

  test('terrain and sea taps clear the selection', async () => {
    const { world, beta } = seeded()
    const { renderer, onSelect } = await render(world, { kind: 'island', projectId: beta.id })
    await renderer.fireEvent(one(renderer.scene, 'terrain'), 'click', { delta: 0 })
    await renderer.fireEvent(one(renderer.scene, 'sea'), 'click', { delta: 0 })
    expect(onSelect.mock.calls).toEqual([[null], [null]])
  })

  test('a landmark tap opens its district; another island’s tap opens that island', async () => {
    const { world, beta, gamma, mvp } = seeded()
    const { renderer, onOpenDistrict, onOpenIsland } = await render(world, {
      kind: 'island',
      projectId: beta.id,
    })
    await renderer.fireEvent(one(renderer.scene, `landmark:${mvp.id}`), 'click', { delta: 0 })
    expect(onOpenDistrict).toHaveBeenCalledWith(beta.id, mvp.id)
    await renderer.fireEvent(one(renderer.scene, `island:${gamma.id}`), 'click', { delta: 0 })
    expect(onOpenIsland).toHaveBeenCalledWith(gamma.id)
  })

  test('in archipelago view an island tap opens it and structures do not select', async () => {
    const { world, beta } = seeded()
    const { renderer, onOpenIsland, onSelect } = await render(world, { kind: 'archipelago' })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(one(island, 'scaffold').props.onClick).toBeUndefined()
    await renderer.fireEvent(island, 'click', { delta: 3 })
    expect(onOpenIsland).toHaveBeenCalledWith(beta.id)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('landmark segments are solid up to progress and ghosted after it', async () => {
    const { world, beta, mvp } = seeded()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const segments = one(renderer.scene, `landmark:${mvp.id}`).children
    // 1 of 2 tasks done → progress 0.5 → ceil(0.5 × 4) = 2 solid of the lighthouse's 4.
    expect(segments.map((s) => s.props.material)).toEqual([
      solidMaterial,
      solidMaterial,
      ghostMaterial,
      ghostMaterial,
    ])
  })

  test('the selected structure gets a ring; a selection elsewhere draws none', async () => {
    const { world, beta, tasks } = seeded()
    const selected = await render(
      world,
      { kind: 'island', projectId: beta.id },
      tasks[0]?.id ?? null,
    )
    expect(named(one(selected.renderer.scene, `island:${beta.id}`), 'selection')).toHaveLength(1)
    const elsewhere = await render(
      world,
      { kind: 'island', projectId: beta.id },
      tasks[4]?.id ?? null,
    )
    expect(named(one(elsewhere.renderer.scene, `island:${beta.id}`), 'selection')).toHaveLength(0)
    const gone = await render(world, { kind: 'island', projectId: beta.id }, 'deleted-task')
    expect(named(gone.renderer.scene, 'selection')).toHaveLength(0)
  })

  test('a refetch with the same seed and radius keeps the terrain geometry', async () => {
    const { world, beta } = seeded()
    const focus: Focus = { kind: 'island', projectId: beta.id }
    const { renderer } = await render(world, focus)
    const terrain = () => one(one(renderer.scene, `island:${beta.id}`), 'terrain').props.geometry
    const before = terrain()
    const props = {
      focus,
      selectedTaskId: null,
      selectedBuildingId: null,
      placement: null,
      rewards: [],
      animate: false,
      ...handlers(),
    }
    await renderer.update(<WorldContents model={buildSceneModel({ ...world }, today)} {...props} />)
    expect(terrain()).toBe(before)
  })

  test('instance counts follow the data when tasks are added or removed', async () => {
    const { world, beta } = seeded()
    const focus: Focus = { kind: 'island', projectId: beta.id }
    const { renderer } = await render(world, focus)
    const more = {
      ...world,
      tasks: [...world.tasks, fakeTask({ projectId: beta.id, status: 'todo', plotX: 0, plotY: 1 })],
    }
    const props = {
      focus,
      selectedTaskId: null,
      selectedBuildingId: null,
      placement: null,
      rewards: [],
      animate: false,
      ...handlers(),
    }
    await renderer.update(<WorldContents model={buildSceneModel(more, today)} {...props} />)
    expect(instanceCount(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toBe(3)
    const fewer = { ...world, tasks: world.tasks.filter((t) => t.status !== 'todo') }
    await renderer.update(<WorldContents model={buildSceneModel(fewer, today)} {...props} />)
    expect(named(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toHaveLength(0)
  })
})

describe('decorations and placement', () => {
  function decorated() {
    const s = seeded()
    const pine = fakeBuilding({
      projectId: s.beta.id,
      type: 'pine',
      plotX: 0,
      plotY: 1,
      rotation: 2,
    })
    const well = fakeBuilding({ projectId: s.beta.id, type: 'well', plotX: -1, plotY: 1 })
    return { ...s, pine, well, world: { ...s.world, buildings: [pine, well] } }
  }

  test('placed decorations stand on their plot, turned by their stored rotation', async () => {
    const { world, beta } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    const check = (name: string, plot: { q: number; r: number }, rotation: number) => {
      const mesh = one(island, name).instance as THREE.InstancedMesh
      const actual = new THREE.Matrix4()
      mesh.getMatrixAt(0, actual)
      const at = hexToWorld(plot)
      const expected = new THREE.Matrix4()
        .makeRotationY((rotation * Math.PI) / 3)
        .setPosition(at.x, LAND_HEIGHT, at.z)
      actual.elements.forEach((v, i) => {
        expect(v).toBeCloseTo(expected.elements[i] ?? Number.NaN)
      })
    }
    check('pine', { q: 0, r: 1 }, 2)
    check('well', { q: -1, r: 1 }, 0)
  })

  test('draws decorations per type, each with a shadow', async () => {
    const { world, beta } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(instanceCount(island, 'pine')).toBe(1)
    expect(instanceCount(island, 'well')).toBe(1)
    expect(instanceCount(island, 'shadow')).toBe(6)
  })

  test('a decoration tap on the focused island selects it; the ring follows', async () => {
    const { world, beta, pine } = decorated()
    const { renderer, onSelectBuilding } = await render(world, {
      kind: 'island',
      projectId: beta.id,
    })
    await renderer.fireEvent(one(renderer.scene, 'pine'), 'click', { instanceId: 0, delta: 1 })
    expect(onSelectBuilding).toHaveBeenCalledWith(pine.id)
    const again = await render(world, { kind: 'island', projectId: beta.id }, null, {
      selectedBuildingId: pine.id,
    })
    const ring = one(again.renderer.scene, 'selection')
    const at = hexToWorld({ q: 0, r: 1 })
    const [x, y, z] = ring.props.position as [number, number, number]
    expect(x).toBeCloseTo(at.x)
    expect(y).toBe(LAND_HEIGHT)
    expect(z).toBeCloseTo(at.z)
  })

  test('placement glows each plot; a tap picks it, a pan does not', async () => {
    const { world, beta } = decorated()
    const plots = [
      { q: 1, r: -1 },
      { q: 2, r: -1 },
      { q: -2, r: 1 },
    ]
    const { renderer, onPickPlot } = await render(
      world,
      { kind: 'island', projectId: beta.id },
      null,
      { placement: { projectId: beta.id, plots, ghost: null } },
    )
    const glow = one(renderer.scene, 'plot')
    expect((glow.instance as THREE.InstancedMesh).count).toBe(3)
    await renderer.fireEvent(glow, 'click', { instanceId: 2, delta: 20 })
    expect(onPickPlot).not.toHaveBeenCalled()
    await renderer.fireEvent(glow, 'click', { instanceId: 2, delta: 2 })
    expect(onPickPlot).toHaveBeenCalledWith({ q: -2, r: 1 })
    expect(named(renderer.scene, 'ghost')).toHaveLength(0)
  })

  test('the ghost stands on its plot, turned like the server will turn it', async () => {
    const { world, beta } = decorated()
    const plot = { q: 2, r: -1 }
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: beta.id, plots: [plot], ghost: { type: 'fountain', plot } },
    })
    const ghost = one(renderer.scene, 'ghost')
    const at = hexToWorld(plot)
    expect(ghost.props.position).toEqual([at.x, LAND_HEIGHT, at.z])
    expect(ghost.props.rotation).toEqual([0, (decorationRotation(plot) * Math.PI) / 3, 0])
  })

  test('while placing, nothing else answers a tap', async () => {
    const { world, beta, gamma, mvp } = decorated()
    const r = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: beta.id, plots: [{ q: 1, r: -1 }], ghost: null },
    })
    const island = one(r.renderer.scene, `island:${beta.id}`)
    await r.renderer.fireEvent(one(island, 'scaffold'), 'click', { instanceId: 0, delta: 1 })
    await r.renderer.fireEvent(one(island, 'pine'), 'click', { instanceId: 0, delta: 1 })
    await r.renderer.fireEvent(one(island, 'terrain'), 'click', { delta: 1 })
    await r.renderer.fireEvent(one(r.renderer.scene, 'sea'), 'click', { delta: 1 })
    await r.renderer.fireEvent(one(r.renderer.scene, `island:${gamma.id}`), 'click', { delta: 1 })
    await r.renderer.fireEvent(one(r.renderer.scene, `landmark:${mvp.id}`), 'click', { delta: 0 })
    expect(r.onSelect).not.toHaveBeenCalled()
    expect(r.onSelectBuilding).not.toHaveBeenCalled()
    expect(r.onOpenIsland).not.toHaveBeenCalled()
    expect(r.onOpenDistrict).not.toHaveBeenCalled()
  })

  test('only the island being decorated shows the glow', async () => {
    const { world, beta, gamma } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: gamma.id, plots: [{ q: 1, r: -1 }], ghost: null },
    })
    expect(named(one(renderer.scene, `island:${beta.id}`), 'plot')).toHaveLength(0)
  })
})

describe('reward effects', () => {
  const reward = (target: RewardEvent['target'], amounts: number[] = [25]): RewardEvent => ({
    id: 1,
    target,
    amounts,
    at: 5000,
  })
  const scaleOf = (node: Node, index: number) => {
    const m = new THREE.Matrix4()
    ;(node.instance as THREE.InstancedMesh).getMatrixAt(index, m)
    return new THREE.Vector3().setFromMatrixScale(m).y
  }
  const shippedOf = (s: ReturnType<typeof seeded>) => {
    const shipped = s.tasks[2]
    if (!shipped) throw new Error('no task')
    return shipped
  }

  test('a completed structure pops past 1 and settles at 1', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: shippedOf(s).id })],
    })
    const hut = one(one(renderer.scene, `island:${s.beta.id}`), 'hut')
    expect(scaleOf(hut, 0)).toBeCloseTo(0)
    let peak = 0
    for (let i = 0; i < 10; i++) {
      await renderer.advanceFrames(1, 0.05)
      peak = Math.max(peak, scaleOf(hut, 0))
    }
    expect(peak).toBeGreaterThan(1.05)
    expect(scaleOf(hut, 0)).toBeCloseTo(1)
  })

  test('a placed decoration pops; its neighbours keep their size', async () => {
    const s = seeded()
    const pine = fakeBuilding({ projectId: s.beta.id, type: 'pine', plotX: 0, plotY: 1 })
    const other = fakeBuilding({ projectId: s.beta.id, type: 'pine', plotX: -1, plotY: 1 })
    const world = { ...s.world, buildings: [other, pine] }
    const { renderer } = await render(world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'building', id: pine.id }, [])],
    })
    const pines = one(one(renderer.scene, `island:${s.beta.id}`), 'pine')
    expect(scaleOf(pines, 1)).toBeCloseTo(0)
    expect(scaleOf(pines, 0)).toBeCloseTo(1)
    await renderer.advanceFrames(10, 0.05)
    expect(scaleOf(pines, 1)).toBeCloseTo(1)
    // A pop carries no amounts, so no float.
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })

  test('a lone popped instance is tappable once the pop ends', async () => {
    const points = [hexToWorld({ q: 0, r: 1 })]
    const renderer = await ReactThreeTestRenderer.create(
      <ModelInstances kind="pine" points={points} pop={{ index: 0, startedAt: 1 }} />,
    )
    const mesh = one(renderer.scene, 'pine').instance as THREE.InstancedMesh
    await renderer.advanceFrames(10, 0.05)
    expect(mesh.boundingSphere?.radius ?? 0).toBeGreaterThan(0)
  })

  test('a pop that starts after an idle gap begins from nothing', async () => {
    const points = [hexToWorld({ q: 0, r: 1 })]
    const renderer = await ReactThreeTestRenderer.create(
      <ModelInstances kind="pine" points={points} />,
    )
    await renderer.update(
      <ModelInstances kind="pine" points={points} pop={{ index: 0, startedAt: 1 }} />,
    )
    // The ticker was idle, so the first delta is the whole gap since the last frame.
    await renderer.advanceFrames(1, 5)
    expect(scaleOf(one(renderer.scene, 'pine'), 0)).toBeLessThan(0.5)
  })

  test('a pop index past the instances is ignored', async () => {
    const points = [hexToWorld({ q: 0, r: 1 }), hexToWorld({ q: 1, r: 0 })]
    const renderer = await ReactThreeTestRenderer.create(
      <ModelInstances kind="pine" points={points} pop={{ index: 5, startedAt: 1 }} />,
    )
    await renderer.advanceFrames(3, 0.05)
    const mesh = one(renderer.scene, 'pine')
    expect(scaleOf(mesh, 0)).toBeCloseTo(1)
    expect(scaleOf(mesh, 1)).toBeCloseTo(1)
  })

  test('floats rise above the focused structure, one line per amount, then disappear', async () => {
    const s = seeded()
    const shipped = shippedOf(s)
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: shipped.id }, [25, 12])],
    })
    const floats = named(renderer.scene, 'float').map((n) => n.instance as THREE.Group)
    expect(floats).toHaveLength(2)
    const [first, second] = floats
    if (!first || !second) throw new Error('no floats')
    const island = buildSceneModel(s.world, today).islands[0]
    const at = hexToWorld({ q: shipped.plotX, r: shipped.plotY })
    expect(first.position.x).toBeCloseTo((island?.origin.x ?? 0) + at.x)
    expect(first.position.z).toBeCloseTo((island?.origin.z ?? 0) + at.z)
    const startY = first.position.y
    // The first frame only starts the clock.
    await renderer.advanceFrames(2, 0.1)
    expect(first.visible).toBe(true)
    expect(first.position.y).toBeGreaterThan(startY)
    // The second line waits 150ms.
    expect(second.visible).toBe(false)
    await renderer.advanceFrames(20, 0.1)
    expect(first.visible).toBe(false)
    expect(second.visible).toBe(false)
  })

  test('a float that starts after an idle gap begins at its anchor', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: shippedOf(s).id })],
    })
    const [float] = named(renderer.scene, 'float').map((n) => n.instance as THREE.Group)
    if (!float) throw new Error('no float')
    const startY = float.position.y
    await renderer.advanceFrames(1, 5)
    expect(float.position.y).toBeCloseTo(startY)
  })

  test('a target outside the scene model shows no float', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'archipelago' }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: 'deleted' })],
    })
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })

  test('reduced motion shows neither the pop nor the float', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: false,
      rewards: [reward({ kind: 'task', id: shippedOf(s).id })],
    })
    const hut = one(one(renderer.scene, `island:${s.beta.id}`), 'hut')
    expect(scaleOf(hut, 0)).toBeCloseTo(1)
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })
})
