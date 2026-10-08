import {
  addDays,
  type DecorationType,
  localDate,
  placeablePlots,
  SHOP_ITEMS,
  type TaskSize,
} from '@archipelago/shared'
import { seedUser } from '../auth/seed-user'
import { placeBuilding } from '../buildings/service'
import type { Db } from '../db/client'
import { getBalance } from '../economy/ledger'
import { claimDailyBonus } from '../economy/service'
import { createMilestone } from '../milestones/service'
import { createProject, updateProject } from '../projects/service'
import { completeTask, createTask, updateTask } from '../tasks/service'
import type { AuthUser } from '../types'
import { occupiedHexes } from '../world/plots'

export const DEMO_PASSWORD = 'archipelago-dev'
export const DEMO_TIMEZONE = 'Asia/Jakarta'
export const DEMO_ACCOUNTS = {
  demo: 'demo@archipelago.local',
  lapsed: 'lapsed@archipelago.local',
  empty: 'empty@archipelago.local',
} as const

type TaskSpec = {
  title: string
  size?: TaskSize
  milestone?: string
  /** Due date, in days from today (negative is overdue). */
  due?: number
  /** Finished this many days ago (0 is today). */
  done?: number
  doing?: boolean
}
type IslandSpec = {
  name: string
  milestones?: string[]
  tasks: TaskSpec[]
  decorations?: DecorationType[]
  archived?: boolean
}

const SIZES: readonly TaskSize[] = ['S', 'M', 'L']
const TOPICS = [
  'Draft the outline',
  'Review the copy',
  'Fix the login flow',
  'Write release notes',
  'Sketch the dashboard',
  'Clean up the backlog',
  'Pair on the parser',
  'Book the venue',
  'Update the roadmap',
  'Profile the slow query',
  'Interview a user',
  'Tidy the design tokens',
]

/** `count` finished tasks, cycling sizes and titles, finished on the given days ago. */
function finished(prefix: string, days: readonly number[], milestone?: string): TaskSpec[] {
  return days.map((done, i) => ({
    title: `${prefix}: ${TOPICS[i % TOPICS.length]}`,
    size: SIZES[i % SIZES.length],
    milestone,
    done,
  }))
}

/** Days ago for older history: never 8, so the current run stops at 8 days. */
const older = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i * 2)

const DEMO_ISLANDS: IslandSpec[] = [
  {
    name: 'Overgrown Harbor',
    milestones: ['Launch', 'Growth'],
    tasks: [
      // Launch: every task done, so the milestone completes and its landmark is solid.
      ...finished('Launch', older(40, 12), 'Launch'),
      // Growth: part-built, with a path to it.
      ...finished('Growth', older(10, 10), 'Growth'),
      { title: 'Growth: Plan the next cohort', milestone: 'Growth', due: 5 },
      { title: 'Growth: Audit the funnel', milestone: 'Growth', size: 'L' },
      { title: 'Growth: Refresh the pricing page', milestone: 'Growth', size: 'S' },
      // The last eight days, every day: the streak.
      ...finished('Harbor', [0, 1, 2, 3, 4, 5, 6, 7, 1, 3]),
      { title: 'Harbor: Rebuild the CI cache', doing: true },
    ],
    decorations: [...SHOP_ITEMS].reverse().map((item) => item.type),
  },
  {
    name: 'Lush Lagoon',
    milestones: ['Beta'],
    tasks: [
      ...finished('Beta', older(12, 8), 'Beta'),
      { title: 'Beta: Invite the first testers', milestone: 'Beta', due: 6 },
      { title: 'Beta: Write the feedback form', milestone: 'Beta', size: 'S' },
      ...finished('Lagoon', [0, 2, 4, 6, ...older(20, 6)]),
      { title: 'Lagoon: Migrate the images', doing: true, size: 'L' },
      { title: 'Lagoon: Rotate the API keys', doing: true, size: 'S' },
      { title: 'Lagoon: Archive old threads' },
    ],
    decorations: ['pine', 'palm'],
  },
  {
    name: 'Green Reach',
    milestones: ['Harbour wall'],
    tasks: [
      ...finished('Wall', [9, 11, 13], 'Harbour wall'),
      { title: 'Wall: Pour the last section', milestone: 'Harbour wall', size: 'L' },
      ...finished('Reach', [0, 3, 5, 15, 17, 19]),
      { title: 'Reach: Send the invoice', due: -3, size: 'S' },
      { title: 'Reach: Prepare the demo', due: 1 },
      { title: 'Reach: Wire up analytics', doing: true },
    ],
  },
  {
    name: 'Sprout Cay',
    milestones: ['Alpha', 'MVP'],
    tasks: [
      ...finished('Alpha', [4], 'Alpha'),
      { title: 'Alpha: Ship the onboarding', milestone: 'Alpha', due: 4 },
      { title: 'Cay: Name the project', size: 'S', done: 2 },
      { title: 'Cay: Set up the repo', size: 'M', done: 3 },
      { title: 'Cay: Choose the stack', size: 'L', done: 5 },
      { title: 'Cay: Write the pitch', doing: true },
      { title: 'Cay: Renew the domain', due: -2, size: 'S' },
      { title: 'Cay: Book user interviews', due: 1, size: 'L' },
      { title: 'Cay: Sketch the logo' },
    ],
  },
  { name: 'Bare Rock', tasks: [] },
  {
    name: 'Old Venture',
    archived: true,
    tasks: [
      ...finished('Venture', [50, 52]),
      { title: 'Venture: Close the accounts' },
      { title: 'Venture: Hand over the docs' },
    ],
  },
]

const LAPSED_ISLANDS: IslandSpec[] = [
  {
    name: 'Side Quest',
    tasks: [
      // Yesterday and the day before: a 2-day streak that ends tonight unless today gets one.
      ...finished('Quest', [1, 2, 22, 23]),
      { title: 'Quest: Fix the flaky test' },
    ],
  },
  {
    name: 'Notebook',
    tasks: [
      ...finished('Notes', [30]),
      { title: 'Notes: Transcribe the meeting' },
      { title: 'Notes: File the receipts', due: 9 },
    ],
  },
]

/** Local times in DEMO_TIMEZONE (UTC+7, no DST). Today's times are minutes before `now`. */
function clockFor(now: Date) {
  const today = localDate(now, DEMO_TIMEZONE)
  const startOfToday = new Date(`${today}T00:00:00+07:00`).getTime()
  return {
    today,
    at(daysAgo: number, hour = 10): Date {
      if (daysAgo === 0)
        return new Date(Math.max(startOfToday, now.getTime() - (hour + 1) * 60_000))
      const hh = String(hour).padStart(2, '0')
      return new Date(`${addDays(today, -daysAgo)}T${hh}:00:00+07:00`)
    },
  }
}

type Clock = ReturnType<typeof clockFor>

/**
 * Builds the islands through the real services, then finishes tasks in time order so rewards,
 * milestone bonuses and streak bonuses are paid exactly as the app would pay them.
 */
async function buildIslands(db: Db, user: AuthUser, islands: IslandSpec[], clock: Clock) {
  const completions: { taskId: string; at: Date }[] = []
  const decorate: { projectId: string; types: DecorationType[] }[] = []
  const archive: string[] = []
  const projectIds: string[] = []
  const created = clock.at(60, 9)

  for (const island of islands) {
    const project = await createProject(db, user.id, { name: island.name })
    projectIds.push(project.id)
    const milestoneIds = new Map<string, string>()
    for (const name of island.milestones ?? []) {
      const m = await createMilestone(db, user.id, project.id, { name })
      milestoneIds.set(name, m.id)
    }
    for (const [i, spec] of island.tasks.entries()) {
      const task = await createTask(
        db,
        user.id,
        {
          projectId: project.id,
          milestoneId: spec.milestone ? (milestoneIds.get(spec.milestone) ?? null) : null,
          title: spec.title,
          notes: '',
          dueDate: spec.due === undefined ? null : addDays(clock.today, spec.due),
          priority: spec.due !== undefined && spec.due < 0 ? 'high' : 'med',
          size: spec.size ?? 'M',
        },
        created,
      )
      if (spec.doing) await updateTask(db, user.id, task.id, { status: 'doing' }, created)
      // Spread a day's completions over its hours so they keep a stable order.
      if (spec.done !== undefined) {
        completions.push({ taskId: task.id, at: clock.at(spec.done, 9 + (i % 10)) })
      }
    }
    if (island.decorations) decorate.push({ projectId: project.id, types: island.decorations })
    if (island.archived) archive.push(project.id)
  }

  completions.sort((a, b) => a.at.getTime() - b.at.getTime())
  for (const c of completions) await completeTask(db, user, c.taskId, c.at)
  return { projectIds, decorate, archive }
}

/** Buys each decoration on a spread-out free plot of its island. */
async function placeDecorations(
  db: Db,
  userId: string,
  projectId: string,
  types: DecorationType[],
  at: Date,
) {
  for (const [i, type] of types.entries()) {
    const plots = placeablePlots(await occupiedHexes(db, projectId))
    const plot = plots[(i * 7) % plots.length]
    if (!plot) throw new Error(`no free plot for ${type}`)
    await placeBuilding(db, userId, { projectId, type, plotX: plot.q, plotY: plot.r }, at)
  }
}

async function account(db: Db, email: string): Promise<AuthUser> {
  return seedUser(db, { email, password: DEMO_PASSWORD, timezone: DEMO_TIMEZONE })
}

/**
 * Seeds three accounts covering the app's visible states (see DEMO_ACCOUNTS):
 * - demo: an island per growth stage, every task look and milestone state, every decoration,
 *   an archived island, an 8-day streak active today, the daily bonus unclaimed.
 * - lapsed: a streak alive from yesterday but not today, the daily bonus claimed, too few
 *   Supplies for the shop.
 * - empty: no islands.
 */
export async function seedDemoWorld(db: Db, now: Date): Promise<void> {
  const clock = clockFor(now)

  const demo = await account(db, DEMO_ACCOUNTS.demo)
  const built = await buildIslands(db, demo, DEMO_ISLANDS, clock)
  for (const d of [7, 6, 5, 4, 3, 2, 1]) await claimDailyBonus(db, demo, clock.at(d, 8))
  for (const d of built.decorate)
    await placeDecorations(db, demo.id, d.projectId, d.types, clock.at(0, 5))
  for (const id of built.archive)
    await updateProject(db, demo.id, id, { archived: true }, clock.at(0, 4))

  const lapsed = await account(db, DEMO_ACCOUNTS.lapsed)
  const [questId] = (await buildIslands(db, lapsed, LAPSED_ISLANDS, clock)).projectIds
  for (const d of [2, 0]) await claimDailyBonus(db, lapsed, clock.at(d, 8))
  // Spend down to below the cheapest item: the shop shows everything unaffordable.
  const cheapest = Math.min(...SHOP_ITEMS.map((item) => item.price))
  while (questId && (await getBalance(db, lapsed.id)) >= cheapest) {
    const balance = await getBalance(db, lapsed.id)
    const item = [...SHOP_ITEMS].reverse().find((s) => s.price <= balance)
    if (!item) break
    await placeDecorations(db, lapsed.id, questId, [item.type], clock.at(0, 3))
  }

  await account(db, DEMO_ACCOUNTS.empty)
}
