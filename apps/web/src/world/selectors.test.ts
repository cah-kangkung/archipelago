import { emptyEconomy, type WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeBuilding, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import {
  addDays,
  dueStatus,
  islandOccupied,
  islandSummaries,
  panelTasks,
  parentPath,
  resolveFocus,
  todayIn,
  urgencyOf,
} from './selectors'

describe('dates', () => {
  test('todayIn uses the given time zone, not the machine one', () => {
    const now = new Date('2026-10-06T18:30:00Z') // 01:30 on the 7th in Jakarta (UTC+7)
    expect(todayIn('Asia/Jakarta', now)).toBe('2026-10-07')
    expect(todayIn('UTC', now)).toBe('2026-10-06')
  })

  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dueStatus', () => {
  const today = '2026-10-07'
  test('overdue before today, due-soon today or tomorrow, otherwise none', () => {
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-06' }, today)).toBe('overdue')
    expect(dueStatus({ status: 'doing', dueDate: '2026-10-07' }, today)).toBe('due-soon')
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-08' }, today)).toBe('due-soon')
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-09' }, today)).toBe('none')
    expect(dueStatus({ status: 'todo', dueDate: null }, today)).toBe('none')
  })

  test('done tasks are never overdue or due-soon', () => {
    expect(dueStatus({ status: 'done', dueDate: '2026-01-01' }, today)).toBe('none')
  })

  test('a Jakarta "today" task is due-soon even while UTC is still on the previous day', () => {
    const today = todayIn('Asia/Jakarta', new Date('2026-10-06T18:30:00Z'))
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-07' }, today)).toBe('due-soon')
  })
})

function sampleWorld(): WorldDto {
  const beta = fakeProject({ name: 'Beta' })
  const gamma = fakeProject({ name: 'Gamma' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  return {
    economy: emptyEconomy(),
    projects: [beta, gamma],
    milestones: [mvp],
    tasks: [
      fakeTask({ projectId: beta.id, title: 'Overdue', dueDate: '2026-10-01', sortOrder: 2 }),
      fakeTask({ projectId: beta.id, title: 'Today', dueDate: '2026-10-07', sortOrder: 1 }),
      fakeTask({ projectId: beta.id, title: 'Later', dueDate: '2026-12-01', sortOrder: 0 }),
      fakeTask({ projectId: beta.id, title: 'In MVP', milestoneId: mvp.id, sortOrder: 3 }),
      fakeTask({
        projectId: beta.id,
        title: 'Done MVP',
        milestoneId: mvp.id,
        status: 'done',
        sortOrder: 0,
      }),
      fakeTask({
        projectId: gamma.id,
        title: 'Gamma overdue',
        dueDate: '2026-09-30',
        sortOrder: 0,
      }),
      fakeTask({
        projectId: gamma.id,
        title: 'Gamma done',
        dueDate: '2026-09-01',
        status: 'done',
        sortOrder: 1,
      }),
    ],
    buildings: [],
  }
}

describe('panelTasks', () => {
  const today = '2026-10-07'

  test('archipelago: open tasks due today or earlier across projects, oldest due first', () => {
    const titles = panelTasks(sampleWorld(), { kind: 'archipelago' }, today).map((t) => t.title)
    expect(titles).toEqual(['Gamma overdue', 'Overdue', 'Today'])
  })

  test("island: all of the project's tasks, open ones before done ones", () => {
    const world = sampleWorld()
    const beta = world.projects[0]
    if (!beta) throw new Error('fixture')
    const titles = panelTasks(world, { kind: 'island', projectId: beta.id }, today).map(
      (t) => t.title,
    )
    expect(titles).toEqual(['Later', 'Today', 'Overdue', 'In MVP', 'Done MVP'])
  })

  test("district: only the milestone's tasks, done last", () => {
    const world = sampleWorld()
    const mvp = world.milestones[0]
    if (!mvp) throw new Error('fixture')
    const focus = { kind: 'district', projectId: mvp.projectId, milestoneId: mvp.id } as const
    expect(panelTasks(world, focus, today).map((t) => t.title)).toEqual(['In MVP', 'Done MVP'])
  })
})

describe('islandSummaries and urgency', () => {
  test('counts open, done, overdue and due-soon per island', () => {
    const [beta, gamma] = islandSummaries(sampleWorld(), '2026-10-07')
    expect(beta).toMatchObject({ open: 4, done: 1, overdue: 1, dueSoon: 1 })
    expect(beta?.milestones.map((m) => m.name)).toEqual(['MVP'])
    expect(gamma).toMatchObject({ open: 1, done: 1, overdue: 1, dueSoon: 0 })
    expect(urgencyOf({ overdue: 1, dueSoon: 3 })).toBe('overdue')
    expect(urgencyOf({ overdue: 0, dueSoon: 1 })).toBe('due-soon')
    expect(urgencyOf({ overdue: 0, dueSoon: 0 })).toBe('none')
  })
})

describe('resolveFocus and parentPath', () => {
  test('maps route params to a focus and flags missing islands or districts', () => {
    const world = sampleWorld()
    const beta = world.projects[0]
    const gamma = world.projects[1]
    const mvp = world.milestones[0]
    if (!beta || !gamma || !mvp) throw new Error('fixture')

    expect(resolveFocus(world, {})).toMatchObject({
      focus: { kind: 'archipelago' },
      missing: false,
    })
    expect(resolveFocus(world, { projectId: beta.id })).toMatchObject({
      focus: { kind: 'island', projectId: beta.id },
      project: beta,
      missing: false,
    })
    expect(resolveFocus(world, { projectId: beta.id, milestoneId: mvp.id })).toMatchObject({
      focus: { kind: 'district', milestoneId: mvp.id },
      milestone: mvp,
      missing: false,
    })
    expect(resolveFocus(world, { projectId: 'nope' }).missing).toBe(true)
    // A real milestone under the wrong island is still "not found".
    expect(resolveFocus(world, { projectId: gamma.id, milestoneId: mvp.id }).missing).toBe(true)
  })

  test('parentPath steps out one level', () => {
    expect(parentPath({ kind: 'archipelago' })).toBeNull()
    expect(parentPath({ kind: 'island', projectId: 'p1' })).toBe('/')
    expect(parentPath({ kind: 'district', projectId: 'p1', milestoneId: 'm1' })).toBe('/p/p1')
  })
})

describe('islandOccupied', () => {
  test('collects task plots, district centres and decoration plots of one island', () => {
    const beta = fakeProject()
    const other = fakeProject()
    const world = {
      tasks: [
        fakeTask({ projectId: beta.id, plotX: 1, plotY: 0 }),
        fakeTask({ projectId: other.id, plotX: 2, plotY: 0 }),
      ],
      milestones: [fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })],
      buildings: [fakeBuilding({ projectId: beta.id, plotX: 0, plotY: 1 })],
    }
    expect(islandOccupied(world, beta.id)).toEqual([
      { q: 1, r: 0 },
      { q: 5, r: 0 },
      { q: 0, r: 1 },
    ])
  })
})
