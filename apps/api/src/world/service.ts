import type { WorldDto } from '@archipelago/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks } from '../db/schema'
import { getEconomy } from '../economy/service'
import { toBuildingDto, toMilestoneDto, toProjectDto, toTaskDto } from '../http/serialize'
import type { AuthUser } from '../types'

export async function getWorld(
  db: Db,
  user: Pick<AuthUser, 'id' | 'timezone'>,
  now: Date,
): Promise<WorldDto> {
  // One repeatable-read snapshot, so the reads can't straddle a concurrent write.
  return db.transaction(
    async (tx) => {
      const economy = await getEconomy(tx, user, now)
      const projectRows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt)))
        .orderBy(asc(projects.createdAt), asc(projects.id))
      const ids = projectRows.map((p) => p.id)
      if (ids.length === 0) {
        return { projects: [], milestones: [], tasks: [], buildings: [], economy }
      }

      const milestoneRows = await tx
        .select()
        .from(milestones)
        .where(inArray(milestones.projectId, ids))
        .orderBy(asc(milestones.sortOrder), asc(milestones.createdAt), asc(milestones.id))
      const taskRows = await tx
        .select()
        .from(tasks)
        .where(inArray(tasks.projectId, ids))
        .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
      const buildingRows = await tx
        .select()
        .from(buildings)
        .where(inArray(buildings.projectId, ids))
        .orderBy(asc(buildings.placedAt), asc(buildings.id))

      return {
        projects: projectRows.map(toProjectDto),
        milestones: milestoneRows.map(toMilestoneDto),
        tasks: taskRows.map(toTaskDto),
        buildings: buildingRows.map(toBuildingDto),
        economy,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}
