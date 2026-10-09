import {
  type CreateMilestoneInput,
  landmarkForIndex,
  type MilestoneDto,
  nextDistrictCenter,
  type UpdateMilestoneInput,
} from '@archipelago/shared'
import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import type { Db } from '../db/client'
import { milestones, projects, tasks } from '../db/schema'
import { AppError } from '../errors'
import { toMilestoneDto } from '../http/serialize'
import { assignTaskPlot, lockOwnedProject, type MilestoneRow, occupiedHexes } from '../world/plots'

const notFound = () => new AppError('not_found', 'Milestone not found')

export async function findOwnedMilestone(
  tx: Db,
  userId: string,
  milestoneId: string,
): Promise<MilestoneRow | null> {
  const [row] = await tx
    .select(getTableColumns(milestones))
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(and(eq(milestones.id, milestoneId), eq(projects.userId, userId)))
  return row ?? null
}

export async function createMilestone(
  db: Db,
  userId: string,
  projectId: string,
  input: CreateMilestoneInput,
): Promise<MilestoneDto> {
  return db.transaction(async (tx) => {
    const project = await lockOwnedProject(tx, userId, projectId)
    if (!project) throw new AppError('not_found', 'Project not found')
    const existingCount = (
      await tx
        .select({ id: milestones.id })
        .from(milestones)
        .where(eq(milestones.projectId, projectId))
    ).length
    // Avoid every occupied hex, not only other centres, so a centre never lands on a task.
    const centre = nextDistrictCenter(project.islandSeed, await occupiedHexes(tx, projectId))
    const [row] = await tx
      .insert(milestones)
      .values({
        projectId,
        name: input.name,
        sortOrder: existingCount,
        landmarkType: landmarkForIndex(existingCount),
        districtQ: centre.q,
        districtR: centre.r,
      })
      .returning()
    if (!row) throw new Error('createMilestone: no row returned')
    return toMilestoneDto(row)
  })
}

export async function updateMilestone(
  db: Db,
  userId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<MilestoneDto> {
  const owned = await findOwnedMilestone(db, userId, milestoneId)
  if (!owned) throw notFound()
  const [row] = await db
    .update(milestones)
    .set({ name: input.name, sortOrder: input.sortOrder })
    .where(eq(milestones.id, milestoneId))
    .returning()
  if (!row) throw notFound()
  return toMilestoneDto(row)
}

export async function deleteMilestone(
  db: Db,
  userId: string,
  milestoneId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const first = await findOwnedMilestone(tx, userId, milestoneId)
    if (!first) throw notFound()
    const project = await lockOwnedProject(tx, userId, first.projectId)
    if (!project) throw notFound()
    // Re-read under the lock: a concurrent delete may have removed it while we waited.
    const owned = await findOwnedMilestone(tx, userId, milestoneId)
    if (!owned) throw notFound()

    const orphans = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.milestoneId, milestoneId))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
    // One at a time: each assignment sees the plots taken by the previous one.
    for (const orphan of orphans) {
      const plot = await assignTaskPlot(tx, project, null)
      await tx
        .update(tasks)
        .set({ milestoneId: null, plotX: plot.q, plotY: plot.r, updatedAt: now })
        .where(eq(tasks.id, orphan.id))
    }
    await tx.delete(milestones).where(eq(milestones.id, milestoneId))
  })
}
