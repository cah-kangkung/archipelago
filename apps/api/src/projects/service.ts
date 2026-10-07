import {
  type CreateProjectInput,
  hexKey,
  nextArchipelagoSlot,
  type ProjectDto,
  type UpdateProjectInput,
} from '@archipelago/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { projects, users } from '../db/schema'
import { AppError } from '../errors'
import { toProjectDto } from '../http/serialize'

/** Non-negative 31-bit integer, so it fits a Postgres `integer`. */
const randomSeed = (): number => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) >>> 1

const notFound = () => new AppError('not_found', 'Project not found')

export async function listProjects(db: Db, userId: string): Promise<ProjectDto[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(asc(projects.createdAt), asc(projects.id))
  return rows.map(toProjectDto)
}

export async function createProject(
  db: Db,
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  return db.transaction(async (tx) => {
    // Lock the owner so two concurrent creates cannot pick the same archipelago slot.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    const existing = await tx
      .select({ q: projects.archipelagoX, r: projects.archipelagoY })
      .from(projects)
      .where(eq(projects.userId, userId))
    const slot = nextArchipelagoSlot(new Set(existing.map(hexKey)))
    const [row] = await tx
      .insert(projects)
      .values({
        userId,
        name: input.name,
        islandSeed: randomSeed(),
        archipelagoX: slot.q,
        archipelagoY: slot.r,
      })
      .returning()
    if (!row) throw new Error('createProject: no row returned')
    return toProjectDto(row)
  })
}

export async function updateProject(
  db: Db,
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
  now: Date,
): Promise<ProjectDto> {
  const changes: Partial<typeof projects.$inferInsert> = {}
  if (input.name !== undefined) changes.name = input.name
  if (input.archived === false) changes.archivedAt = null
  const [row] = await db
    .update(projects)
    .set(
      input.archived === true
        ? // Keep the original archive time if it is already archived.
          {
            ...changes,
            archivedAt: sql`coalesce(${projects.archivedAt}, ${now.toISOString()}::timestamptz)`,
          }
        : changes,
    )
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning()
  if (!row) throw notFound()
  return toProjectDto(row)
}

export async function deleteProject(db: Db, userId: string, projectId: string): Promise<void> {
  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning({ id: projects.id })
  if (deleted.length === 0) throw notFound()
}
