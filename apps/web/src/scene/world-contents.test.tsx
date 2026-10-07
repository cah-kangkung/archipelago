import type { WorldDto } from '@archipelago/shared'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { addDays, type Focus } from '../world/selectors'
import { ghostMaterial, solidMaterial } from './materials'
import { buildSceneModel } from './model/scene-model'
import { WorldContents } from './world-contents'

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

const handlers = () => ({ onSelect: vi.fn(), onOpenIsland: vi.fn(), onOpenDistrict: vi.fn() })

async function render(world: WorldDto, focus: Focus, selectedTaskId: string | null = null) {
  const h = handlers()
  const renderer = await ReactThreeTestRenderer.create(
    <WorldContents
      model={buildSceneModel(world, today)}
      focus={focus}
      selectedTaskId={selectedTaskId}
      animate={false}
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

  test('instance counts follow the data when tasks are added or removed', async () => {
    const { world, beta } = seeded()
    const focus: Focus = { kind: 'island', projectId: beta.id }
    const { renderer } = await render(world, focus)
    const more = {
      ...world,
      tasks: [...world.tasks, fakeTask({ projectId: beta.id, status: 'todo', plotX: 0, plotY: 1 })],
    }
    const props = { focus, selectedTaskId: null, animate: false, ...handlers() }
    await renderer.update(<WorldContents model={buildSceneModel(more, today)} {...props} />)
    expect(instanceCount(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toBe(3)
    const fewer = { ...world, tasks: world.tasks.filter((t) => t.status !== 'todo') }
    await renderer.update(<WorldContents model={buildSceneModel(fewer, today)} {...props} />)
    expect(named(one(renderer.scene, `island:${beta.id}`), 'scaffold')).toHaveLength(0)
  })
})
