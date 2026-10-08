import {
  type Hex,
  localDate,
  type MilestoneDto,
  type ProjectDto,
  addDays as sharedAddDays,
  type TaskDto,
  type WorldDto,
} from '@archipelago/shared'

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDate(now, timeZone)
}

export const addDays = sharedAddDays

export type DueStatus = 'overdue' | 'due-soon' | 'none'

export function dueStatus(task: Pick<TaskDto, 'status' | 'dueDate'>, today: string): DueStatus {
  if (task.status === 'done' || task.dueDate === null) return 'none'
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate <= addDays(today, 1)) return 'due-soon'
  return 'none'
}

export type Focus =
  | { kind: 'archipelago' }
  | { kind: 'island'; projectId: string }
  | { kind: 'district'; projectId: string; milestoneId: string }

export function resolveFocus(
  world: WorldDto,
  params: { projectId?: string; milestoneId?: string },
): { focus: Focus; project: ProjectDto | null; milestone: MilestoneDto | null; missing: boolean } {
  const archipelago = { focus: { kind: 'archipelago' } as Focus, project: null, milestone: null }
  if (!params.projectId) return { ...archipelago, missing: false }
  const project = world.projects.find((p) => p.id === params.projectId) ?? null
  if (!project) return { ...archipelago, missing: true }
  if (!params.milestoneId) {
    return {
      focus: { kind: 'island', projectId: project.id },
      project,
      milestone: null,
      missing: false,
    }
  }
  const milestone =
    world.milestones.find((m) => m.id === params.milestoneId && m.projectId === project.id) ?? null
  if (!milestone) return { ...archipelago, missing: true }
  return {
    focus: { kind: 'district', projectId: project.id, milestoneId: milestone.id },
    project,
    milestone,
    missing: false,
  }
}

export function parentPath(focus: Focus): string | null {
  if (focus.kind === 'district') return `/p/${focus.projectId}`
  if (focus.kind === 'island') return '/'
  return null
}

const openFirstThenOrder = (a: TaskDto, b: TaskDto) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  a.sortOrder - b.sortOrder ||
  a.createdAt.localeCompare(b.createdAt)

export function panelTasks(world: WorldDto, focus: Focus, today: string): TaskDto[] {
  if (focus.kind === 'archipelago') {
    const active = new Set(world.projects.map((p) => p.id))
    return world.tasks
      .filter(
        (t) =>
          active.has(t.projectId) &&
          t.status !== 'done' &&
          t.dueDate !== null &&
          t.dueDate <= today,
      )
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.sortOrder - b.sortOrder)
  }
  const inScope =
    focus.kind === 'island'
      ? (t: TaskDto) => t.projectId === focus.projectId
      : (t: TaskDto) => t.milestoneId === focus.milestoneId
  return world.tasks.filter(inScope).sort(openFirstThenOrder)
}

export type IslandSummary = {
  project: ProjectDto
  milestones: MilestoneDto[]
  open: number
  done: number
  overdue: number
  dueSoon: number
}

export function islandSummaries(world: WorldDto, today: string): IslandSummary[] {
  return world.projects.map((project) => {
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const statuses = tasks.map((t) => dueStatus(t, today))
    return {
      project,
      milestones: world.milestones
        .filter((m) => m.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      open: tasks.filter((t) => t.status !== 'done').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: statuses.filter((s) => s === 'overdue').length,
      dueSoon: statuses.filter((s) => s === 'due-soon').length,
    }
  })
}

export function urgencyOf(summary: Pick<IslandSummary, 'overdue' | 'dueSoon'>): DueStatus {
  if (summary.overdue > 0) return 'overdue'
  if (summary.dueSoon > 0) return 'due-soon'
  return 'none'
}

/** Everything standing on one island: task plots, district centres, then decoration plots. */
export function islandOccupied(
  world: Pick<WorldDto, 'tasks' | 'milestones' | 'buildings'>,
  projectId: string,
): Hex[] {
  return [
    ...world.tasks
      .filter((t) => t.projectId === projectId)
      .map((t) => ({ q: t.plotX, r: t.plotY })),
    ...world.milestones
      .filter((m) => m.projectId === projectId)
      .map((m) => ({ q: m.districtQ, r: m.districtR })),
    ...world.buildings
      .filter((b) => b.projectId === projectId)
      .map((b) => ({ q: b.plotX, r: b.plotY })),
  ]
}
