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

export async function insertTask(
  db: Db,
  projectId: string,
  overrides: Partial<typeof tasks.$inferInsert> = {},
) {
  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title: 'Task',
      plotX: Math.floor(Math.random() * 1_000_000) + 100,
      plotY: 0,
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
