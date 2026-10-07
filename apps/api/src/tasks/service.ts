import type {
  CompleteTaskResultDto,
  CreateTaskInput,
  ReopenTaskResultDto,
  TaskDto,
  TaskListQuery,
  UpdateTaskInput,
} from '@archipelago/shared'
import { and, asc, eq, getTableColumns, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { projects, tasks } from '../db/schema'
import { getBalance } from '../economy/ledger'
import { awardCompletion, reverseCompletion } from '../economy/rewards'
import { AppError } from '../errors'
import { toTaskDto } from '../http/serialize'
import type { AuthUser } from '../types'
import {
  assignTaskPlot,
  findMilestoneInProject,
  lockOwnedProject,
  syncMilestoneCompletion,
  type TaskRow,
} from '../world/plots'

const notFound = () => new AppError('not_found', 'Task not found')
const invalid = (field: string, message: string) =>
  new AppError('validation_failed', 'Request body is invalid', { [field]: [message] })
const wrongMilestone = () => invalid('milestoneId', 'Milestone does not belong to this project')

export async function findOwnedTask(
  tx: Db,
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const [row] = await tx
    .select(getTableColumns(tasks))
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(projects.userId, userId)))
  return row ?? null
}

async function lockOwnedTaskProject(tx: Db, userId: string, taskId: string) {
  const found = await findOwnedTask(tx, userId, taskId)
  if (!found) throw notFound()
  const project = await lockOwnedProject(tx, userId, found.projectId)
  if (!project) throw notFound()
  return project
}

export async function listTasks(db: Db, userId: string, query: TaskListQuery): Promise<TaskDto[]> {
  const filters: SQL[] = [eq(projects.userId, userId)]
  if (query.project) filters.push(eq(tasks.projectId, query.project))
  if (query.milestone) filters.push(eq(tasks.milestoneId, query.milestone))
  if (query.status) filters.push(eq(tasks.status, query.status))
  const rows = await db
    .select(getTableColumns(tasks))
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...filters))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
  return rows.map(toTaskDto)
}

export async function createTask(
  db: Db,
  userId: string,
  input: CreateTaskInput,
  now: Date,
): Promise<TaskDto> {
  return db.transaction(async (tx) => {
    const project = await lockOwnedProject(tx, userId, input.projectId)
    if (!project) throw invalid('projectId', 'Project not found')
    const milestone = input.milestoneId
      ? await findMilestoneInProject(tx, input.milestoneId, project.id)
      : null
    if (input.milestoneId && !milestone) throw wrongMilestone()

    const plot = await assignTaskPlot(tx, project, milestone)
    const sortOrder = (
      await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id))
    ).length
    const [row] = await tx
      .insert(tasks)
      .values({
        projectId: project.id,
        milestoneId: milestone?.id ?? null,
        title: input.title,
        notes: input.notes,
        dueDate: input.dueDate,
        priority: input.priority,
        size: input.size,
        plotX: plot.q,
        plotY: plot.r,
        sortOrder,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('createTask: no row returned')
    await syncMilestoneCompletion(tx, row.milestoneId, now)
    return toTaskDto(row)
  })
}

export async function updateTask(
  db: Db,
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
  now: Date,
): Promise<TaskDto> {
  return db.transaction(async (tx) => {
    const project = await lockOwnedTaskProject(tx, userId, taskId)
    // Re-read under the project lock so the checks below cannot be stale.
    const task = await findOwnedTask(tx, userId, taskId)
    if (!task) throw notFound()
    if (input.status !== undefined && task.status === 'done') {
      throw new AppError('conflict', 'Task is done; reopen it before changing its status')
    }

    // Undefined values are skipped by Drizzle; an explicit null clears dueDate.
    const changes: Partial<typeof tasks.$inferInsert> = {
      title: input.title,
      notes: input.notes,
      dueDate: input.dueDate,
      priority: input.priority,
      size: input.size,
      status: input.status,
      sortOrder: input.sortOrder,
      updatedAt: now,
    }

    const moves = input.milestoneId !== undefined && input.milestoneId !== task.milestoneId
    if (moves) {
      const target = input.milestoneId
        ? await findMilestoneInProject(tx, input.milestoneId, task.projectId)
        : null
      if (input.milestoneId && !target) throw wrongMilestone()
      const plot = await assignTaskPlot(tx, project, target)
      changes.milestoneId = target?.id ?? null
      changes.plotX = plot.q
      changes.plotY = plot.r
    }

    const [row] = await tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).returning()
    if (!row) throw notFound()
    if (moves) {
      await syncMilestoneCompletion(tx, task.milestoneId, now)
      await syncMilestoneCompletion(tx, row.milestoneId, now)
    }
    return toTaskDto(row)
  })
}

export async function deleteTask(db: Db, user: AuthUser, taskId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the milestone sync sees current state.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    await tx.delete(tasks).where(eq(tasks.id, taskId))
    await syncMilestoneCompletion(tx, task.milestoneId, now)
    if (task.status === 'done') await reverseCompletion(tx, user, task, now)
  })
}

export async function completeTask(
  db: Db,
  user: AuthUser,
  taskId: string,
  now: Date,
): Promise<CompleteTaskResultDto> {
  return db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the checks below cannot be stale.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    if (task.status === 'done') throw new AppError('conflict', 'Task is already done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'done', completedAt: now, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestoneCompleted =
      (await syncMilestoneCompletion(tx, row.milestoneId, now)) === 'completed'
    const rewards = await awardCompletion(tx, user, row, milestoneCompleted, now)
    return {
      task: toTaskDto(row),
      milestoneCompleted,
      rewards,
      balance: await getBalance(tx, user.id),
    }
  })
}

export async function reopenTask(
  db: Db,
  user: AuthUser,
  taskId: string,
  now: Date,
): Promise<ReopenTaskResultDto> {
  return db.transaction(async (tx) => {
    await lockOwnedTaskProject(tx, user.id, taskId)
    // Re-read under the project lock so the checks below cannot be stale.
    const task = await findOwnedTask(tx, user.id, taskId)
    if (!task) throw notFound()
    if (task.status !== 'done') throw new AppError('conflict', 'Task is not done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'todo', completedAt: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestoneReopened =
      (await syncMilestoneCompletion(tx, row.milestoneId, now)) === 'reopened'
    const reversals = await reverseCompletion(tx, user, task, now)
    return {
      task: toTaskDto(row),
      milestoneReopened,
      reversals,
      balance: await getBalance(tx, user.id),
    }
  })
}
