import {
  type AuthUserDto,
  type BuildingDto,
  type CompleteTaskResultDto,
  DAILY_BONUS,
  decorationRotation,
  economySnapshot,
  isPlaceable,
  type LedgerKind,
  localDate,
  type MilestoneDto,
  milestoneBonus,
  type ProjectDto,
  type ReopenTaskResultDto,
  type RewardDto,
  refundFor,
  shopItem,
  type TaskDto,
  taskReward,
  type WorldDto,
} from '@archipelago/shared'
import { type Api, ApiError } from '../api/api'
import { islandOccupied } from '../world/selectors'

export type WorldSeed = Omit<WorldDto, 'economy'>
export type FakeEntry = {
  kind: Exclude<LedgerKind, 'reversal'>
  amount: number
  /** Local date (YYYY-MM-DD) the entry was written. */
  day: string
  taskId: string | null
  milestoneId: string | null
  live: boolean
}

export type FakeState = {
  user: AuthUserDto | null
  password: string
  world: WorldSeed
  ledger: FakeEntry[]
  today: string
}

let counter = 0
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const stamp = '2026-10-07T00:00:00.000Z'

export const fakeUser = (): AuthUserDto => ({
  id: nextId(),
  email: 'boss@example.com',
  timezone: 'Asia/Jakarta',
})

export const fakeProject = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: nextId(),
  name: 'Beta',
  islandSeed: 1,
  archipelagoX: 0,
  archipelagoY: 0,
  archivedAt: null,
  createdAt: stamp,
  ...overrides,
})

export const fakeMilestone = (overrides: Partial<MilestoneDto> = {}): MilestoneDto => ({
  id: nextId(),
  projectId: nextId(),
  name: 'MVP',
  sortOrder: 0,
  landmarkType: 'lighthouse',
  districtQ: 5,
  districtR: 0,
  completedAt: null,
  createdAt: stamp,
  ...overrides,
})

export const fakeBuilding = (overrides: Partial<BuildingDto> = {}): BuildingDto => ({
  id: nextId(),
  projectId: nextId(),
  type: 'pine',
  plotX: 0,
  plotY: 1,
  rotation: 0,
  placedAt: stamp,
  ...overrides,
})

export const fakeTask = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: nextId(),
  projectId: nextId(),
  milestoneId: null,
  title: 'Task',
  notes: '',
  dueDate: null,
  priority: 'med',
  size: 'M',
  status: 'todo',
  completedAt: null,
  plotX: 1,
  plotY: 0,
  sortOrder: 0,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
})

export const fakeEntry = (overrides: Partial<FakeEntry> = {}): FakeEntry => ({
  kind: 'task_reward',
  amount: 25,
  day: '2026-10-07',
  taskId: null,
  milestoneId: null,
  live: true,
  ...overrides,
})

/** In-memory Api with the server's rules, for component tests. */
export function createFakeApi(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    user: seed.user === undefined ? fakeUser() : seed.user,
    password: seed.password ?? 'correct horse battery staple',
    world: seed.world ?? { projects: [], milestones: [], tasks: [], buildings: [] },
    ledger: seed.ledger ?? [],
    today: seed.today ?? localDate(new Date(), 'Asia/Jakarta'),
  }
  const calls: string[] = []

  const authed = (name: string) => {
    calls.push(name)
    if (!state.user) throw new ApiError(401, 'unauthorized', 'Authentication required')
  }
  const findTask = (id: string) => {
    const task = state.world.tasks.find((t) => t.id === id)
    if (!task) throw new ApiError(404, 'not_found', 'Task not found')
    return task
  }
  // Streak bonuses are not simulated here (covered by server tests), so streakDays is always null.
  const toReward = (e: FakeEntry): RewardDto => ({
    kind: e.kind as RewardDto['kind'],
    amount: e.amount,
    streakDays: null,
  })
  const pay = (entry: Omit<FakeEntry, 'day' | 'live'>): RewardDto => {
    state.ledger.push({ ...entry, day: state.today, live: true })
    return toReward(entry as FakeEntry)
  }
  const balance = () => state.ledger.reduce((sum, e) => sum + (e.live ? e.amount : 0), 0)
  const economy = () =>
    economySnapshot({
      balance: balance(),
      days: new Set(
        state.ledger.filter((e) => e.live && e.kind === 'task_reward').map((e) => e.day),
      ),
      today: state.today,
      claimedToday: state.ledger.some((e) => e.kind === 'daily_bonus' && e.day === state.today),
    })
  /** Mirrors the server's milestone sync: complete iff it has tasks and all are done. */
  const syncMilestone = (milestoneId: string | null): 'completed' | 'reopened' | 'unchanged' => {
    const milestone = state.world.milestones.find((m) => m.id === milestoneId)
    if (!milestone) return 'unchanged'
    const its = state.world.tasks.filter((t) => t.milestoneId === milestone.id)
    const complete = its.length > 0 && its.every((t) => t.status === 'done')
    if (complete && milestone.completedAt === null) {
      milestone.completedAt = stamp
      return 'completed'
    }
    if (!complete && milestone.completedAt !== null) {
      milestone.completedAt = null
      return 'reopened'
    }
    return 'unchanged'
  }
  const reverseTask = (taskId: string): RewardDto[] => {
    const own = state.ledger.filter((e) => e.live && e.taskId === taskId)
    for (const e of own) e.live = false
    return own.map(toReward)
  }
  const replaceTask = (task: TaskDto) => {
    state.world.tasks = state.world.tasks.map((t) => (t.id === task.id ? task : t))
    return task
  }
  const checkMilestone = (projectId: string, milestoneId: string | null | undefined) => {
    if (!milestoneId) return
    const m = state.world.milestones.find((x) => x.id === milestoneId)
    if (!m || m.projectId !== projectId) {
      throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
        milestoneId: ['Milestone does not belong to this project'],
      })
    }
  }

  const api: Api = {
    me: async () => {
      authed('me')
      return { user: state.user as AuthUserDto }
    },
    login: async (input) => {
      calls.push('login')
      if (input.password !== state.password) {
        throw new ApiError(401, 'unauthorized', 'Invalid email or password')
      }
      state.user = state.user ?? { ...fakeUser(), email: input.email }
      return { user: state.user }
    },
    logout: async () => {
      calls.push('logout')
      state.user = null
    },
    world: async () => {
      authed('world')
      // Like the server: archived islands (and everything on them) are hidden.
      const projects = state.world.projects.filter((p) => p.archivedAt === null)
      const ids = new Set(projects.map((p) => p.id))
      return structuredClone({
        projects,
        milestones: state.world.milestones.filter((m) => ids.has(m.projectId)),
        tasks: state.world.tasks.filter((t) => ids.has(t.projectId)),
        buildings: state.world.buildings.filter((b) => ids.has(b.projectId)),
        economy: economy(),
      })
    },
    createProject: async (input) => {
      authed('createProject')
      const project = fakeProject({ name: input.name, archipelagoX: state.world.projects.length })
      state.world.projects.push(project)
      return { project }
    },
    updateProject: async (id, input) => {
      authed('updateProject')
      const project = state.world.projects.find((p) => p.id === id)
      if (!project) throw new ApiError(404, 'not_found', 'Project not found')
      if (input.name !== undefined) project.name = input.name
      if (input.archived !== undefined) project.archivedAt = input.archived ? stamp : null
      return { project: { ...project } }
    },
    deleteProject: async (id) => {
      authed('deleteProject')
      state.world.projects = state.world.projects.filter((p) => p.id !== id)
      state.world.milestones = state.world.milestones.filter((m) => m.projectId !== id)
      state.world.tasks = state.world.tasks.filter((t) => t.projectId !== id)
      state.world.buildings = state.world.buildings.filter((b) => b.projectId !== id)
    },
    createMilestone: async (projectId, input) => {
      authed('createMilestone')
      const sortOrder = state.world.milestones.filter((m) => m.projectId === projectId).length
      const milestone = fakeMilestone({ projectId, name: input.name, sortOrder })
      state.world.milestones.push(milestone)
      return { milestone }
    },
    updateMilestone: async (id, input) => {
      authed('updateMilestone')
      const milestone = state.world.milestones.find((m) => m.id === id)
      if (!milestone) throw new ApiError(404, 'not_found', 'Milestone not found')
      if (input.name !== undefined) milestone.name = input.name
      if (input.sortOrder !== undefined) milestone.sortOrder = input.sortOrder
      return { milestone: { ...milestone } }
    },
    deleteMilestone: async (id) => {
      authed('deleteMilestone')
      state.world.milestones = state.world.milestones.filter((m) => m.id !== id)
      state.world.tasks = state.world.tasks.map((t) =>
        t.milestoneId === id ? { ...t, milestoneId: null } : t,
      )
    },
    createTask: async (input) => {
      authed('createTask')
      checkMilestone(input.projectId, input.milestoneId)
      const task = fakeTask({
        projectId: input.projectId,
        milestoneId: input.milestoneId ?? null,
        title: input.title,
        notes: input.notes ?? '',
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? 'med',
        size: input.size ?? 'M',
        sortOrder: state.world.tasks.length,
      })
      state.world.tasks.push(task)
      syncMilestone(task.milestoneId)
      return { task }
    },
    updateTask: async (id, input) => {
      authed('updateTask')
      const task = findTask(id)
      if (input.status !== undefined && task.status === 'done') {
        throw new ApiError(409, 'conflict', 'Task is done; reopen it before changing its status')
      }
      checkMilestone(task.projectId, input.milestoneId)
      const next: TaskDto = { ...task }
      if (input.title !== undefined) next.title = input.title
      if (input.notes !== undefined) next.notes = input.notes
      if (input.dueDate !== undefined) next.dueDate = input.dueDate
      if (input.priority !== undefined) next.priority = input.priority
      if (input.size !== undefined) next.size = input.size
      if (input.status !== undefined) next.status = input.status
      if (input.milestoneId !== undefined) next.milestoneId = input.milestoneId
      const saved = replaceTask(next)
      if (task.milestoneId !== saved.milestoneId) syncMilestone(task.milestoneId)
      syncMilestone(saved.milestoneId)
      return { task: saved }
    },
    deleteTask: async (id) => {
      authed('deleteTask')
      const task = findTask(id)
      state.world.tasks = state.world.tasks.filter((t) => t.id !== id)
      syncMilestone(task.milestoneId)
      if (task.status === 'done') reverseTask(id)
    },
    completeTask: async (id): Promise<CompleteTaskResultDto> => {
      authed('completeTask')
      const task = findTask(id)
      if (task.status === 'done') throw new ApiError(409, 'conflict', 'Task is already done')
      const done = replaceTask({ ...task, status: 'done', completedAt: stamp })
      const milestoneCompleted = syncMilestone(done.milestoneId) === 'completed'
      const rewards = [
        pay({
          kind: 'task_reward',
          amount: taskReward(done.size, done.dueDate, state.today),
          taskId: id,
          milestoneId: null,
        }),
      ]
      const milestoneId = done.milestoneId
      const liveBonus = state.ledger.some(
        (e) => e.live && e.kind === 'milestone_bonus' && e.milestoneId === milestoneId,
      )
      if (milestoneCompleted && milestoneId && !liveBonus) {
        const sizes = state.world.tasks
          .filter((t) => t.milestoneId === milestoneId)
          .map((t) => t.size)
        rewards.push(
          pay({ kind: 'milestone_bonus', amount: milestoneBonus(sizes), taskId: id, milestoneId }),
        )
      }
      return { task: done, milestoneCompleted, rewards, balance: balance() }
    },
    reopenTask: async (id): Promise<ReopenTaskResultDto> => {
      authed('reopenTask')
      const task = findTask(id)
      if (task.status !== 'done') throw new ApiError(409, 'conflict', 'Task is not done')
      const open = replaceTask({ ...task, status: 'todo', completedAt: null })
      const milestoneReopened = syncMilestone(open.milestoneId) === 'reopened'
      return { task: open, milestoneReopened, reversals: reverseTask(id), balance: balance() }
    },
    placeBuilding: async (input) => {
      authed('placeBuilding')
      const project = state.world.projects.find(
        (p) => p.id === input.projectId && p.archivedAt === null,
      )
      if (!project) throw new ApiError(404, 'not_found', 'Project not found')
      const item = shopItem(input.type)
      if (!item) {
        throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
          type: ['Unknown decoration'],
        })
      }
      const plot = { q: input.plotX, r: input.plotY }
      const occupied = islandOccupied(state.world, project.id)
      if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) {
        throw new ApiError(409, 'conflict', 'That plot is taken')
      }
      if (!isPlaceable(project.islandSeed, occupied, plot)) {
        throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
          plot: ['Plot is not free land on this island'],
        })
      }
      if (balance() < 0) throw new ApiError(409, 'insufficient_supplies', 'Balance is negative')
      if (balance() < item.price) {
        throw new ApiError(409, 'insufficient_supplies', 'Not enough Supplies')
      }
      const building = fakeBuilding({
        projectId: project.id,
        type: item.type,
        plotX: plot.q,
        plotY: plot.r,
        rotation: decorationRotation(plot),
      })
      state.world.buildings.push(building)
      state.ledger.push({
        kind: 'purchase',
        amount: -item.price,
        day: state.today,
        taskId: null,
        milestoneId: null,
        live: true,
      })
      return { building: { ...building }, balance: balance() }
    },
    removeBuilding: async (id) => {
      authed('removeBuilding')
      const building = state.world.buildings.find((b) => b.id === id)
      if (!building) throw new ApiError(404, 'not_found', 'Building not found')
      state.world.buildings = state.world.buildings.filter((b) => b.id !== id)
      const refund = refundFor(shopItem(building.type)?.price ?? 0)
      if (refund > 0) {
        state.ledger.push({
          kind: 'refund',
          amount: refund,
          day: state.today,
          taskId: null,
          milestoneId: null,
          live: true,
        })
      }
      return { refund, balance: balance() }
    },
    economy: async () => {
      authed('economy')
      return { economy: economy() }
    },
    claimDaily: async () => {
      authed('claimDaily')
      if (economy().daily.claimedToday) {
        throw new ApiError(409, 'conflict', 'Daily bonus already claimed today')
      }
      const reward = pay({
        kind: 'daily_bonus',
        amount: DAILY_BONUS,
        taskId: null,
        milestoneId: null,
      })
      return { reward, economy: economy() }
    },
  }

  return { api, state, calls }
}
