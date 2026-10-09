import { COMMONS_CENTER, type Hex, hexKey, hexRing } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../src/auth/passwords'
import type { Config } from '../src/config'
import type { Db } from '../src/db/client'
import { buildings, milestones, projects, tasks, users } from '../src/db/schema'

export async function insertUser(
  db: Db,
  overrides: { email?: string; timezone?: string; passwordHash?: string } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${crypto.randomUUID()}@example.com`,
      timezone: overrides.timezone ?? 'Asia/Jakarta',
      passwordHash: overrides.passwordHash ?? 'not-a-real-hash',
    })
    .returning()
  if (!user) throw new Error('insertUser: no row returned')
  return user
}

export const testConfig: Config = {
  databaseUrl: process.env.DATABASE_URL_TEST ?? '',
  port: 0,
  cookieSecure: true,
  trustProxy: true,
  sessionTtlDays: 30,
}

export async function insertUserWithPassword(
  db: Db,
  overrides: { email?: string; timezone?: string } = {},
) {
  const password = 'correct horse battery staple'
  const user = await insertUser(db, { ...overrides, passwordHash: await hashPassword(password) })
  return { user, password }
}

export async function insertProject(
  db: Db,
  userId: string,
  overrides: Partial<typeof projects.$inferInsert> = {},
) {
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: 'Beta',
      islandSeed: 0,
      archipelagoX: Math.floor(Math.random() * 1_000_000),
      archipelagoY: 0,
      ...overrides,
    })
    .returning()
  if (!project) throw new Error('insertProject: no row returned')
  return project
}

export async function insertMilestone(
  db: Db,
  projectId: string,
  overrides: Partial<typeof milestones.$inferInsert> = {},
) {
  const [milestone] = await db
    .insert(milestones)
    .values({
      projectId,
      name: 'MVP',
      landmarkType: 'lighthouse',
      districtQ: 5,
      districtR: 0,
      ...overrides,
    })
    .returning()
  if (!milestone) throw new Error('insertMilestone: no row returned')
  return milestone
}

async function nearHex(db: Db, projectId: string): Promise<Hex> {
  const taken = new Set(
    (
      await db
        .select({ q: tasks.plotX, r: tasks.plotY })
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
    ).map(hexKey),
  )
  for (let ring = 1; ring <= 3; ring++) {
    for (const h of hexRing(COMMONS_CENTER, ring)) if (!taken.has(hexKey(h))) return h
  }
  throw new Error('insertTask: no free near plot')
}

export async function insertTask(
  db: Db,
  projectId: string,
  overrides: Partial<typeof tasks.$inferInsert> = {},
) {
  // Unless told otherwise, the nearest free hex around the commons. Only rings 0-1 are always
  // interior (rings 2-3 are always land, but may be shore), so a test that fills these rings may
  // have the API grow the island; none gets near its size cap.
  const near =
    overrides.plotX === undefined && overrides.plotY === undefined
      ? await nearHex(db, projectId)
      : null
  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title: 'Task',
      plotX: near?.q ?? 0,
      plotY: near?.r ?? 0,
      ...overrides,
    })
    .returning()
  if (!task) throw new Error('insertTask: no row returned')
  return task
}

export async function insertBuilding(
  db: Db,
  projectId: string,
  overrides: Partial<typeof buildings.$inferInsert> = {},
) {
  const [building] = await db
    .insert(buildings)
    .values({ projectId, type: 'tree', plotX: 0, plotY: 1, ...overrides })
    .returning()
  if (!building) throw new Error('insertBuilding: no row returned')
  return building
}
