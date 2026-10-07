import { LEDGER_KINDS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES } from '@archipelago/shared'
import {
  type AnyPgColumn,
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
const createdAt = () => timestamptz().notNull().defaultNow()

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
  (t) => [index('projects_user_id_idx').on(t.userId)],
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
    completedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('milestones_project_id_idx').on(t.projectId)],
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
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_milestone_id_idx').on(t.milestoneId),
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
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_user_id_idx').on(t.userId),
    uniqueIndex('ledger_reverses_id_unique').on(t.reversesId),
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
    placedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('buildings_project_plot_unique').on(t.projectId, t.plotX, t.plotY)],
)
