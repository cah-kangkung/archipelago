import { LEDGER_KINDS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES } from '@archipelago/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const taskPriority = pgEnum('task_priority', TASK_PRIORITIES)
export const taskSize = pgEnum('task_size', TASK_SIZES)
export const taskStatus = pgEnum('task_status', TASK_STATUSES)
export const ledgerKind = pgEnum('ledger_kind', LEDGER_KINDS)

const timestamptz = () => timestamp({ withTimezone: true })
// clock_timestamp() advances within a transaction, unlike now(), so creation order is stable.
const createdAt = () => timestamptz().notNull().default(sql`clock_timestamp()`)

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  timezone: text().notNull(),
  createdAt: createdAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 hex digest of the session token; the token itself is never stored.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    lastUsedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('api_tokens_user_id_idx').on(t.userId)],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    islandSeed: integer().notNull(),
    archipelagoX: integer().notNull(),
    archipelagoY: integer().notNull(),
    archivedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('projects_user_id_idx').on(t.userId),
    uniqueIndex('projects_user_slot_unique').on(t.userId, t.archipelagoX, t.archipelagoY),
  ],
)

export const milestones = pgTable(
  'milestones',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    landmarkType: text().notNull(),
    // Axial hex centre of this milestone's district on its island; the landmark stands here.
    districtQ: integer().notNull(),
    districtR: integer().notNull(),
    completedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('milestones_project_id_idx').on(t.projectId),
    uniqueIndex('milestones_project_district_unique').on(t.projectId, t.districtQ, t.districtR),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid().references(() => milestones.id, { onDelete: 'set null' }),
    title: text().notNull(),
    notes: text().notNull().default(''),
    dueDate: date({ mode: 'string' }),
    priority: taskPriority().notNull().default('med'),
    size: taskSize().notNull().default('M'),
    status: taskStatus().notNull().default('todo'),
    completedAt: timestamptz(),
    plotX: integer().notNull(),
    plotY: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    externalSource: text(),
    externalId: text(),
    externalUrl: text(),
    createdAt: createdAt(),
    updatedAt: timestamptz().notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_milestone_id_idx').on(t.milestoneId),
    uniqueIndex('tasks_project_plot_unique').on(t.projectId, t.plotX, t.plotY),
    // NULLs are distinct in Postgres, so native tasks (both columns null) never collide.
    uniqueIndex('tasks_external_ref_unique').on(t.externalSource, t.externalId),
  ],
)

export const ledger = pgTable(
  'ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: ledgerKind().notNull(),
    amount: integer().notNull(),
    refType: text(),
    refId: uuid(),
    reversesId: uuid().references((): AnyPgColumn => ledger.id),
    // The task whose completion produced this entry. No FK: entries outlive deleted tasks.
    sourceTaskId: uuid(),
    // Streak bonuses only: the run's first local day and the threshold paid.
    streakStart: date({ mode: 'string' }),
    streakDays: smallint(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_user_id_idx').on(t.userId),
    index('ledger_source_task_id_idx').on(t.sourceTaskId),
    uniqueIndex('ledger_reverses_id_unique').on(t.reversesId),
    check(
      'ledger_streak_fields',
      sql`(${t.kind} = 'streak_bonus') = (${t.streakStart} is not null and ${t.streakDays} is not null)`,
    ),
  ],
)

export const buildings = pgTable(
  'buildings',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    plotX: integer().notNull(),
    plotY: integer().notNull(),
    rotation: smallint().notNull().default(0),
    placedAt: timestamptz().notNull().default(sql`clock_timestamp()`),
  },
  (t) => [uniqueIndex('buildings_project_plot_unique').on(t.projectId, t.plotX, t.plotY)],
)
