import { COMMONS_CENTER, type Hex, nearestFreePlot, seedDirection } from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks } from '../db/schema'

export type ProjectRow = typeof projects.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type TaskRow = typeof tasks.$inferSelect

/** Row-locks the project for the rest of the transaction, so plot/district picks cannot race. */
export async function lockOwnedProject(
  tx: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const [project] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .for('update')
  return project ?? null
}

export async function findMilestoneInProject(
  tx: Db,
  milestoneId: string,
  projectId: string,
): Promise<MilestoneRow | null> {
  const [milestone] = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
  return milestone ?? null
}

/** Task plots, decoration plots and district centres on the island; the commons centre is not included. */
export async function occupiedHexes(tx: Db, projectId: string): Promise<Hex[]> {
  const [taskPlots, buildingPlots, centres] = await Promise.all([
    tx.select({ q: tasks.plotX, r: tasks.plotY }).from(tasks).where(eq(tasks.projectId, projectId)),
    tx
      .select({ q: buildings.plotX, r: buildings.plotY })
      .from(buildings)
      .where(eq(buildings.projectId, projectId)),
    tx
      .select({ q: milestones.districtQ, r: milestones.districtR })
      .from(milestones)
      .where(eq(milestones.projectId, projectId)),
  ])
  return [...taskPlots, ...buildingPlots, ...centres]
}

export async function assignTaskPlot(
  tx: Db,
  project: ProjectRow,
  milestone: MilestoneRow | null,
): Promise<Hex> {
  const occupied = await occupiedHexes(tx, project.id)
  const centre = milestone ? { q: milestone.districtQ, r: milestone.districtR } : COMMONS_CENTER
  return nearestFreePlot(project.islandSeed, centre, seedDirection(project.islandSeed), occupied)
}

/** A milestone is complete iff it has at least one task and every task is done. */
export async function syncMilestoneCompletion(
  tx: Db,
  milestoneId: string | null,
  now: Date,
): Promise<'completed' | 'reopened' | 'unchanged'> {
  if (milestoneId === null) return 'unchanged'
  const [milestone] = await tx
    .select({ completedAt: milestones.completedAt })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
  if (!milestone) return 'unchanged'

  const statuses = await tx
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.milestoneId, milestoneId))
  const complete = statuses.length > 0 && statuses.every((t) => t.status === 'done')

  if (complete && milestone.completedAt === null) {
    await tx.update(milestones).set({ completedAt: now }).where(eq(milestones.id, milestoneId))
    return 'completed'
  }
  if (!complete && milestone.completedAt !== null) {
    await tx.update(milestones).set({ completedAt: null }).where(eq(milestones.id, milestoneId))
    return 'reopened'
  }
  return 'unchanged'
}
